# 錠剤の図（表・裏）の内側に文字・記号があるか。割線（まっすぐな1本の線）は除く。値は内側の文字らしい暗い画素の割合（None＝判定できない）
import io, numpy as np
from PIL import Image
from scipy import ndimage as nd
def score(b):
    im=Image.open(io.BytesIO(b)).convert('RGBA')
    bg=Image.new('RGBA',im.size,(255,255,255,255)); bg.alpha_composite(im); im=bg.convert('L')
    if max(im.size)<160:
        s=max(1,round(160/max(im.size))); im=im.resize((im.width*s,im.height*s),Image.NEAREST)
    a=np.asarray(im,dtype=float)
    bgv=np.median(np.concatenate([a[0],a[-1],a[:,0],a[:,-1]]))
    if bgv<170: return None
    dark=a<bgv-70
    # 輪郭の切れ目をふさいでから外側をたどる
    wall=nd.binary_dilation(dark,iterations=2)
    lab,_=nd.label(~wall)
    border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    outside=nd.binary_dilation(np.isin(lab,list(border)),iterations=2)
    shape=~outside
    if shape.sum()<300: return None
    lab3,n3=nd.label(shape)
    total=0; area=0
    for i in range(1,n3+1):
        sh=lab3==i
        if sh.sum()<300: continue
        k=max(3,int(np.sqrt(sh.sum())*0.08))
        inner=nd.binary_erosion(sh,iterations=k)
        if inner.sum()<50: continue
        d=dark&inner
        if d.sum()>0.5*inner.sum(): return None  # 写真など
        for r in np.where(inner.any(1))[0]:
            if d[r].sum()>0.6*inner[r].sum(): d[r]=False
        for c in np.where(inner.any(0))[0]:
            if d[:,c].sum()>0.6*inner[:,c].sum(): d[:,c]=False
        lab2,n=nd.label(d)
        if n:
            sizes=nd.sum(d,lab2,range(1,n+1)); total+=sum(x for x in sizes if x>=6)
        area+=inner.sum()
    return total/area if area else None
