<?php

namespace Concrete\Package\Pharmacalc;

use Concrete\Core\Package\Package;
use Concrete\Core\Support\Facade\Url;
use Concrete\Core\User\User;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Response;

defined('C5_EXECUTE') or die('Access Denied.');

/**
 * 薬剤師電卓（Web版）を /pharmacalc で配信するパッケージ。
 * サイトにログインしている人だけが開ける。app/ フォルダに Web 版のビルド一式（web/dist）が入る。
 * apk/PharmaCalc.apk を置くと、Android 版のアプリを /pharmacalc/android.apk で配る。
 */
class Controller extends Package
{
    protected $pkgHandle = 'pharmacalc';
    protected $appVersionRequired = '9.0.0';
    protected $pkgVersion = '1.4.0';

    /** ログインしていなくても配る物（ホーム画面に追加するときにブラウザが取りに来る。中身に個人情報は無い） */
    private const PUBLIC_FILES = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

    private const TYPES = [
        'html' => 'text/html; charset=utf-8',
        'js' => 'text/javascript; charset=utf-8',
        'css' => 'text/css; charset=utf-8',
        'json' => 'application/json',
        'webmanifest' => 'application/manifest+json',
        'wasm' => 'application/wasm',
        'png' => 'image/png',
        'svg' => 'image/svg+xml',
    ];

    public function getPackageName()
    {
        return t('薬剤師電卓');
    }

    public function getPackageDescription()
    {
        return t('薬剤師向けの電卓（腎機能・日数・余り・小児用量・錠剤カウント・バーコードから添付文書）。/pharmacalc で開きます。');
    }

    public function on_start()
    {
        $router = $this->app->make('router');
        $router->get('/pharmacalc', function () {
            return new RedirectResponse((string) Url::to('/pharmacalc/index.html'));
        });
        $router->get('/pharmacalc/{file}', function ($file) {
            return $this->serve((string) $file);
        })->setRequirements(['file' => '.+']);
    }

    private function serve(string $file): Response
    {
        if ($file === 'android.apk') {
            return $this->serveApk();
        }
        if (preg_match('#^pmda-yj/(\d{8,14})$#', $file, $m)) {
            return $this->pmdaYj($m[1]);
        }
        $root = realpath(__DIR__ . '/app');
        $path = $root === false ? false : realpath($root . '/' . $file);
        // app/ の外のファイルは出さない
        if ($path === false || strpos($path, $root . DIRECTORY_SEPARATOR) !== 0 || !is_file($path)) {
            return new Response('', 404);
        }
        $isPublic = in_array($file, self::PUBLIC_FILES, true);
        if (!$isPublic && !$this->loggedIn()) {
            if ($file === 'index.html') {
                return $this->toLogin();
            }
            // 画面以外（JavaScript など）は 401。電波が無いときと同じく、保存済みの物で動く
            return new Response('', 401, ['Cache-Control' => 'no-store']);
        }
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        // 大きいファイル（腎機能の薬・OTC類似薬のデータなど）は、ビルドで作った .gz を圧縮のまま送る
        $send = $path;
        $gz = false;
        $accept = (string) ($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '');
        if (strpos($accept, 'gzip') !== false && is_file($path . '.gz')) {
            $send = $path . '.gz';
            $gz = true;
        }
        $res = new BinaryFileResponse($send);
        if ($gz) {
            $res->headers->set('Content-Encoding', 'gzip');
            $res->headers->set('Vary', 'Accept-Encoding');
        }
        $res->headers->set('Content-Type', self::TYPES[$ext] ?? 'application/octet-stream');
        $res->headers->set('X-Content-Type-Options', 'nosniff');
        if (strpos($file, 'assets/') === 0) {
            // assets/ のファイル名には中身のハッシュが入っているので、長く保存してよい
            $res->headers->set('Cache-Control', 'private, max-age=31536000, immutable');
        } else {
            $res->headers->set('Cache-Control', 'no-cache');
        }
        if ($file === 'index.html') {
            $res->headers->set('X-Frame-Options', 'SAMEORIGIN');
        }
        return $res;
    }

    /**
     * Android 版のアプリ（apk/PharmaCalc.apk）を配る。ログインした人だけ。
     * スマホがダウンロード後にそのままインストールできるよう、apk の種類（MIME）とファイル名をつけて送る
     */
    private function serveApk(): Response
    {
        $path = __DIR__ . '/apk/PharmaCalc.apk';
        if (!is_file($path)) {
            return new Response('', 404);
        }
        if (!$this->loggedIn()) {
            return $this->toLogin('/pharmacalc/android.apk');
        }
        $res = new BinaryFileResponse($path);
        $res->headers->set('Content-Type', 'application/vnd.android.package-archive');
        $res->setContentDisposition('attachment', 'PharmaCalc.apk');
        $res->headers->set('Cache-Control', 'no-cache');
        $res->headers->set('X-Content-Type-Options', 'nosniff');
        return $res;
    }

    /**
     * GS1コード（GTIN）から、PMDA の添付文書に載っている製品の YJコードを返す（OTC類似薬チェック用）。
     * PTPシートのコード（調剤包装単位）は公開のマスターに無いので、PMDA の「バーコードから添付文書を開く」を使う。
     * ブラウザからは PMDA に直接問い合わせられないので、このサーバーが代わりに問い合わせる。結果は30日保存する
     */
    private function pmdaYj(string $gtin): Response
    {
        if (!$this->loggedIn()) {
            return new Response('', 401, ['Cache-Control' => 'no-store']);
        }
        $gtin = str_pad($gtin, 14, '0', STR_PAD_LEFT);
        $cache = sys_get_temp_dir() . '/pharmacalc_pmda_' . $gtin . '.json';
        if (is_file($cache) && filemtime($cache) > time() - 30 * 86400) {
            return $this->json(file_get_contents($cache));
        }
        $base = 'https://www.pmda.go.jp/PmdaSearch/';
        [$status, $location, $body] = $this->fetch($base . 'bookSearch/01/' . $gtin);
        if ($status === 0) {
            return new Response('', 502);
        }
        // 1件なら添付文書（PDF）への転送、複数なら品目を選ぶ画面になる。どちらからも添付文書の番号を拾う
        preg_match_all('#(\d{6}_\d{7}[0-9A-Z]\d{4}_\d+_\d+)#', $location . ' ' . $body, $m);
        $ids = array_slice(array_values(array_unique($m[1])), 0, 4);
        $yj = [];
        foreach ($ids as $id) {
            $rep = explode('_', $id)[1];
            $yj[] = $rep;
            [$st, , $html] = $this->fetch($base . 'iyakuDetail/' . $id);
            if ($st === 200 && preg_match_all('#(?<![0-9A-Z])(\d{7}[0-9A-Z]\d{4})(?![0-9A-Z])#', $html, $mm)) {
                foreach ($mm[1] as $code) {
                    // 同じ添付文書に載る製品は、YJコードの先頭7桁（成分と剤形の分類）が同じ
                    if (substr($code, 0, 7) === substr($rep, 0, 7)) {
                        $yj[] = $code;
                    }
                }
            }
        }
        $out = json_encode(['gtin' => $gtin, 'ids' => $ids, 'yj' => array_values(array_unique($yj))], JSON_UNESCAPED_UNICODE);
        if ($ids) {
            @file_put_contents($cache, $out);
        }
        return $this->json($out);
    }

    private function json(string $s): Response
    {
        return new Response($s, 200, ['Content-Type' => 'application/json; charset=utf-8', 'Cache-Control' => 'no-store']);
    }

    /** 転送をたどらずに取得する。[状態コード, 転送先, 本文]（つながらなければ状態コード 0） */
    private function fetch(string $url): array
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_HEADER => true,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_USERAGENT => 'PharmaCalc/1.0',
            ]);
            $raw = curl_exec($ch);
            if ($raw === false) {
                return [0, '', ''];
            }
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $hsize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
            $head = substr($raw, 0, $hsize);
            $body = substr($raw, $hsize);
        } else {
            $ctx = stream_context_create(['http' => ['follow_location' => 0, 'timeout' => 15, 'ignore_errors' => true, 'user_agent' => 'PharmaCalc/1.0']]);
            $body = @file_get_contents($url, false, $ctx);
            if ($body === false) {
                return [0, '', ''];
            }
            $head = implode("\n", $http_response_header ?? []);
            $status = preg_match('#HTTP/\S+\s+(\d{3})#', $head, $sm) ? (int) $sm[1] : 0;
        }
        $location = preg_match('#^Location:\s*(\S+)#mi', $head, $lm) ? $lm[1] : '';
        // PDF の中身は使わない
        if (strpos($head, 'application/pdf') !== false) {
            $body = '';
        }
        return [$status, $location, $body];
    }

    private function loggedIn(): bool
    {
        try {
            $u = $this->app->make(User::class);
            return $u->isRegistered();
        } catch (\Throwable $e) {
            return false;
        }
    }

    /** ログイン画面へ。ログインしたら電卓に戻ってくるようにする */
    private function toLogin(string $back = '/pharmacalc/index.html'): Response
    {
        try {
            $this->app->make('Concrete\Core\User\PostLoginLocation')->setSessionPostLoginUrl((string) Url::to($back));
        } catch (\Throwable $e) {
            // 戻り先を覚えられなくても、ログイン画面には進める
        }
        return new RedirectResponse((string) Url::to('/login'));
    }
}
