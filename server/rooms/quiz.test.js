import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quizPoints, prepareQuestion, QUESTION_MS } from './quiz.js';

test('quizPoints: đúng sớm nhiều điểm, sai = 0', () => {
  assert.equal(quizPoints(true, QUESTION_MS), 1000);
  assert.equal(quizPoints(true, 0), 500);
  assert.equal(quizPoints(false, QUESTION_MS), 0);
  assert.ok(quizPoints(true, 10_000) > quizPoints(true, 2_000));
});

test('prepareQuestion trộn đáp án nhưng giữ đúng đáp án đúng', () => {
  const raw = { q: '?', a: ['A', 'B', 'C', 'D'], c: 2 };
  for (let i = 0; i < 20; i++) {
    const p = prepareQuestion(raw);
    assert.equal(p.a[p.c], 'C');
    assert.deepEqual([...p.a].sort(), ['A', 'B', 'C', 'D']);
  }
});

test('bộ đề hợp lệ', () => {
  const bank = JSON.parse(readFileSync(new URL('../data/quiz-vi.json', import.meta.url), 'utf8'));
  assert.ok(bank.length >= 10);
  for (const q of bank) {
    assert.equal(q.a.length, 4, q.q);
    assert.ok(q.c >= 0 && q.c < 4, q.q);
  }
});
