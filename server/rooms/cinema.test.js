import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeId, createCinema } from './cinema.js';

test('parseYouTubeId nhận các dạng link', () => {
  const id = 'dQw4w9WgXcQ';
  for (const u of [
    id,
    `https://www.youtube.com/watch?v=${id}&t=10s`,
    `https://youtu.be/${id}?si=abc`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://music.youtube.com/watch?v=${id}`,
  ]) assert.equal(parseYouTubeId(u), id, u);
  assert.equal(parseYouTubeId('https://vimeo.com/123'), null);
  assert.equal(parseYouTubeId('hello'), null);
});

test('cinema: play/pause/seek theo thời gian', () => {
  let t = 0;
  const c = createCinema(() => t);
  c.add('aaaaaaaaaaa', 'A', 'x');
  assert.equal(c.state().isPlaying, true);
  t = 10_000;
  assert.equal(c.positionNow(), 10);
  c.pause();
  t = 20_000;
  assert.equal(c.positionNow(), 10);
  c.seek(50);
  assert.equal(c.state().isPlaying, false);
  c.play();
  t = 25_000;
  assert.equal(c.positionNow(), 55);
});

test('cinema: hàng chờ và ended chỉ chuyển 1 lần', () => {
  const c = createCinema(() => 0);
  c.add('aaaaaaaaaaa', 'A', 'x');
  c.add('bbbbbbbbbbb', 'B', 'x');
  c.add('ccccccccccc', 'C', 'x');
  const uidA = c.state().current.uid;
  c.ended(uidA);
  c.ended(uidA); // client thứ 2 báo trùng → bỏ qua
  assert.equal(c.state().current.title, 'B');
  assert.equal(c.state().queue.length, 1);
  c.next();
  c.next();
  assert.equal(c.state().current, null);
  assert.equal(c.state().isPlaying, false);
});
