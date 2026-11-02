import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { checkAdmin } from './world.js';

const salt = 'muoi-thu';
const builtin = { salt, hash: scryptSync('mat-khau-dung', salt, 32).toString('hex') };

test('checkAdmin: biến môi trường ADMIN_PASSWORD được ưu tiên', () => {
  assert.equal(checkAdmin('bi-mat', 'bi-mat', builtin, ''), true);
  assert.equal(checkAdmin('mat-khau-dung', 'bi-mat', builtin, ''), false); // có env thì mật khẩu dựng sẵn không dùng nữa
  assert.equal(checkAdmin('bi-mat ', 'bi-mat', builtin, ''), false);
});

test('checkAdmin: không có env → so với mã băm dựng sẵn', () => {
  assert.equal(checkAdmin('mat-khau-dung', '', builtin, ''), true);
  assert.equal(checkAdmin('mat-khau-sai', '', builtin, ''), false);
  assert.equal(checkAdmin('admin', '', builtin, ''), false);      // production: "admin" không dùng được
  assert.equal(checkAdmin('admin', '', builtin, 'admin'), true);  // dev: "admin" cho tiện thử
});

test('checkAdmin: dữ liệu rác luôn bị từ chối', () => {
  for (const bad of ['', null, undefined, 5, {}, { toString: () => 'mat-khau-dung' }, 'x'.repeat(500)]) assert.equal(checkAdmin(bad, '', builtin, ''), false);
});
