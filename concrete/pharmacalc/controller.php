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
 */
class Controller extends Package
{
    protected $pkgHandle = 'pharmacalc';
    protected $appVersionRequired = '9.0.0';
    protected $pkgVersion = '1.0.0';

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
        $res = new BinaryFileResponse($path);
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
    private function toLogin(): Response
    {
        try {
            $this->app->make('Concrete\Core\User\PostLoginLocation')->setSessionPostLoginUrl((string) Url::to('/pharmacalc/index.html'));
        } catch (\Throwable $e) {
            // 戻り先を覚えられなくても、ログイン画面には進める
        }
        return new RedirectResponse((string) Url::to('/login'));
    }
}
