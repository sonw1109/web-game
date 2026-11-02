import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAdmin } from './world.js';

test('checkAdmin: đúng/sai mật khẩu, chưa đặt mật khẩu thì luôn từ chối', () => {
  assert.equal(checkAdmin('bi-mat', 'bi-mat'), true);
  assert.equal(checkAdmin('bi-mat ', 'bi-mat'), false);
  assert.equal(checkAdmin('', 'bi-mat'), false);
  assert.equal(checkAdmin(null, 'bi-mat'), false);
  assert.equal(checkAdmin({ toString: () => 'bi-mat' }, 'bi-mat'), false); // chỉ nhận chuỗi
  assert.equal(checkAdmin('bất kỳ', ''), false); // production chưa đặt ADMIN_PASSWORD → tắt admin
});
