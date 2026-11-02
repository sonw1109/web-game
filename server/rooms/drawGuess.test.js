import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, guessPoints, maskWord, DRAW_MS } from './drawGuess.js';

test('normalize: không phân biệt dấu, hoa thường, khoảng trắng', () => {
  assert.equal(normalize('  Con  Mèo! '), 'con meo');
  assert.equal(normalize('đèn lồng'), normalize('DEN LONG'));
  assert.notEqual(normalize('con mèo'), normalize('con mẹ'));
});

test('guessPoints: sớm nhiều điểm hơn, tối thiểu 50', () => {
  assert.equal(guessPoints(DRAW_MS), 300);
  assert.ok(guessPoints(DRAW_MS * 0.8) > guessPoints(DRAW_MS * 0.3));
  assert.equal(guessPoints(0), 50);
});

test('maskWord giữ khoảng trắng và chữ đã lộ', () => {
  assert.equal(maskWord('con mèo', new Set()), '___ ___');
  assert.equal(maskWord('con mèo', new Set([0, 5])), 'c__ _è_');
});
