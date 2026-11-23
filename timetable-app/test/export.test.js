import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../export.js';

const e = (title) => ({ date: '2030-01-01', title, start: '09:00', end: '10:00', category: 'work', done: false });

test('toCsv: embedded line break is quoted; tab and CR leads are neutralised', () => {
  assert.match(toCsv([e('a\nb')]), /"a\nb"/);
  assert.match(toCsv([e('\tx')]), /,'\tx,/);
  assert.match(toCsv([e('\rx')]), /,"'\rx",/);
});

test('toCsv: empty list is header only', () => {
  assert.equal(toCsv([]), '\uFEFFdate,title,start,end,category,done\r\n');
});
