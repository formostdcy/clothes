#!/usr/bin/env python3
# -*- coding: utf-8 -*-
f = r'd:\校服小程序0\cloudfunctions\boss-overview\index.js'
with open(f, 'rb') as fp:
    data = fp.read()
text = data.decode('utf-8')
lines = text.split('\n')
print('第 16 行:')
print('  hex:', lines[15].encode('utf-8').hex())
print('  内容:', repr(lines[15]))
print()
print('第 17 行:')
print('  hex:', lines[16].encode('utf-8').hex())
print('  内容:', repr(lines[16]))
