import re

f = r'd:\校服小程序0\cloudfunctions\auth-getUserInfo\index.js'
with open(f, 'rb') as fp:
    data = fp.read()
# 找所有 return { ... } 行
for m in re.finditer(b'return [^;]+;', data):
    s = m.group(0)
    print('--- 位置', m.start())
    print('hex:', s.hex())
    print('decode:', s.decode('utf-8', errors='replace'))
