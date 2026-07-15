'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.js');

const { HeatmapCard } = loadCard();

// The card's data methods are plain instance methods that only read `this.config`,
// `this.meta` and `this.myhass`. We exercise them on a bare object whose prototype is
// HeatmapCard.prototype, which avoids constructing a real LitElement while still
// resolving sibling method calls (e.g. combine_grids -> combine_cell/day_key).
function makeCard(props = {}) {
    return Object.assign(Object.create(HeatmapCard.prototype), props);
}

test('day_key formats a date as zero-padded YYYY-MM-DD', () => {
    const card = makeCard();
    assert.equal(card.day_key(new Date(2024, 0, 5)), '2024-01-05');
    assert.equal(card.day_key(new Date(2024, 11, 31)), '2024-12-31');
});

test('combine_cell (measurement) yields null when either side is missing', () => {
    const card = makeCard();
    assert.equal(card.combine_cell(null, 5, 'difference', true), null);
    assert.equal(card.combine_cell(5, null, 'difference', true), null);
    assert.equal(card.combine_cell(undefined, 5, 'sum', true), null);
    assert.equal(card.combine_cell(5, undefined, 'sum', true), null);
});

test('combine_cell (measurement) subtracts and sums present values', () => {
    const card = makeCard();
    assert.equal(card.combine_cell(10, 4, 'difference', true), 6);
    assert.equal(card.combine_cell(10, 4, 'sum', true), 14);
});

test('combine_cell (non-measurement) treats missing values as zero', () => {
    const card = makeCard();
    assert.equal(card.combine_cell(null, 3, 'difference', false), -3);
    assert.equal(card.combine_cell(3, null, 'sum', false), 3);
    assert.equal(card.combine_cell(null, null, 'sum', false), 0);
});

test('combine_cell rounds to two decimals to avoid float noise', () => {
    const card = makeCard();
    assert.equal(card.combine_cell(0.1, 0.3, 'difference', false), -0.2);
    assert.equal(card.combine_cell(1.005, 0, 'sum', false), 1.0); // toFixed rounding
});

test('combine_grids aligns rows by calendar day, not array index', () => {
    const card = makeCard({ meta: { state_class: 'measurement' } });
    const day1 = new Date(2024, 0, 1);
    const day2 = new Date(2024, 0, 2);
    const primary = [
        { date: 'Jan 01', nativeDate: day1, vals: [10, 20] },
        { date: 'Jan 02', nativeDate: day2, vals: [5, 6] }
    ];
    // Secondary is deliberately in a different order to prove day-key alignment.
    const secondary = [
        { date: 'Jan 02', nativeDate: new Date(2024, 0, 2), vals: [1, 2] },
        { date: 'Jan 01', nativeDate: new Date(2024, 0, 1), vals: [4, 5] }
    ];
    const combined = card.combine_grids(primary, secondary, 'difference');
    assert.equal(combined.length, 2);
    assert.deepEqual([...combined[0].vals], [6, 15]);
    assert.deepEqual([...combined[1].vals], [4, 4]);
});

test('combine_grids drops days present only in the secondary grid', () => {
    const card = makeCard({ meta: { state_class: 'total_increasing' } });
    const primary = [
        { date: 'Jan 01', nativeDate: new Date(2024, 0, 1), vals: [10] }
    ];
    const secondary = [
        { date: 'Jan 01', nativeDate: new Date(2024, 0, 1), vals: [4] },
        { date: 'Jan 09', nativeDate: new Date(2024, 0, 9), vals: [99] }
    ];
    const combined = card.combine_grids(primary, secondary, 'difference');
    assert.equal(combined.length, 1);
    assert.deepEqual([...combined[0].vals], [6]);
});

test('combine_grids treats missing secondary hours per the state_class null policy', () => {
    // measurement: unmatched hour becomes null
    const measurement = makeCard({ meta: { state_class: 'measurement' } });
    const mResult = measurement.combine_grids(
        [{ date: 'Jan 01', nativeDate: new Date(2024, 0, 1), vals: [10, 20] }],
        [{ date: 'Jan 01', nativeDate: new Date(2024, 0, 1), vals: [1] }],
        'difference'
    );
    assert.deepEqual([...mResult[0].vals], [9, null]);

    // total_increasing: unmatched hour treated as 0
    const total = makeCard({ meta: { state_class: 'total_increasing' } });
    const tResult = total.combine_grids(
        [{ date: 'Jan 01', nativeDate: new Date(2024, 0, 1), vals: [10, 20] }],
        [{ date: 'Jan 01', nativeDate: new Date(2024, 0, 1), vals: [1] }],
        'difference'
    );
    assert.deepEqual([...tResult[0].vals], [9, 20]);
});

test('max_from and min_from ignore nulls', () => {
    const card = makeCard();
    const grid = [
        { vals: [1, null, 3] },
        { vals: [null, -2, 5] }
    ];
    assert.equal(card.max_from(grid), 5);
    assert.equal(card.min_from(grid), -2);
});

test('secondary_state_class_conflict returns null without a secondary entity', () => {
    const card = makeCard({ config: {}, meta: {}, myhass: { states: {} } });
    assert.equal(card.secondary_state_class_conflict(), null);
});

test('secondary_state_class_conflict tolerates unknown state classes', () => {
    const card = makeCard({
        config: { entity: 'sensor.a', secondary_entity: 'sensor.b' },
        meta: { state_class: undefined },
        myhass: { states: { 'sensor.b': { attributes: {} } } }
    });
    assert.equal(card.secondary_state_class_conflict(), null);
});

test('secondary_state_class_conflict flags mixing measurement with total', () => {
    const card = makeCard({
        config: { entity: 'sensor.a', secondary_entity: 'sensor.b' },
        meta: { state_class: 'measurement' },
        myhass: { states: { 'sensor.b': { attributes: { state_class: 'total_increasing' } } } }
    });
    const msg = card.secondary_state_class_conflict();
    assert.match(msg, /Cannot combine entities/);
    assert.match(msg, /sensor\.a/);
    assert.match(msg, /sensor\.b/);
});

test('secondary_state_class_conflict allows two compatible entities', () => {
    const card = makeCard({
        config: { entity: 'sensor.a', secondary_entity: 'sensor.b' },
        meta: { state_class: 'total' },
        myhass: { states: { 'sensor.b': { attributes: { state_class: 'total_increasing' } } } }
    });
    assert.equal(card.secondary_state_class_conflict(), null);
});

test('apply_symmetric_range widens auto range symmetrically around zero', () => {
    const card = makeCard({
        config: { secondary_entity: 'sensor.b', operation: 'difference', data: {} },
        meta: { data: { min: -3, max: 8 } }
    });
    card.apply_symmetric_range();
    assert.equal(card.meta.data.min, -8);
    assert.equal(card.meta.data.max, 8);
});

test('apply_symmetric_range is a no-op without a difference of two entities', () => {
    const card = makeCard({
        config: { operation: 'difference', data: {} },
        meta: { data: { min: -3, max: 8 } }
    });
    card.apply_symmetric_range();
    assert.equal(card.meta.data.min, -3);
    assert.equal(card.meta.data.max, 8);
});

test('apply_symmetric_range is a no-op when min or max is pinned', () => {
    const card = makeCard({
        config: { secondary_entity: 'sensor.b', operation: 'difference', data: { min: 0 } },
        meta: { data: { min: -3, max: 8 } }
    });
    card.apply_symmetric_range();
    assert.equal(card.meta.data.min, -3);
    assert.equal(card.meta.data.max, 8);
});

test('getCardSize scales with days in hourly mode and weeks in daily mode', () => {
    assert.equal(makeCard({ config: { mode: 'hourly', days: 21 } }).getCardSize(), 1 + Math.ceil(21 / 6));
    assert.equal(makeCard({ config: { mode: 'hourly', days: 0 } }).getCardSize(), 1);
    assert.equal(makeCard({ config: { mode: 'daily', weeks: 12 } }).getCardSize(), 1 + Math.ceil(12 / 3));
});

test('getStubConfig prefers a recorder-tracked sensor', () => {
    const hass = {
        states: {
            'light.kitchen': { attributes: {} },
            'sensor.plain': { attributes: {} },
            'sensor.tracked': { attributes: { state_class: 'measurement' } }
        }
    };
    assert.equal(HeatmapCard.getStubConfig(hass).entity, 'sensor.tracked');
});

test('getStubConfig falls back to any sensor, then to an empty entity', () => {
    const onlyPlain = { states: { 'sensor.plain': { attributes: {} } } };
    assert.equal(HeatmapCard.getStubConfig(onlyPlain).entity, 'sensor.plain');
    const noSensors = { states: { 'light.kitchen': { attributes: {} } } };
    assert.equal(HeatmapCard.getStubConfig(noSensors).entity, '');
    assert.equal(HeatmapCard.getStubConfig(undefined).entity, '');
});

test('build_weekly_grid buckets days into Mon-Sun weeks, newest week first', () => {
    const card = makeCard({ meta: { language: 'en-US' } });
    const grid = card.build_weekly_grid([
        { start: '2024-01-01T12:00:00Z', value: 1 }, // Mon, week 1
        { start: '2024-01-03T12:00:00Z', value: 3 }, // Wed, week 1
        { start: '2024-01-08T12:00:00Z', value: 8 }  // Mon, week 2
    ]);
    assert.equal(grid.length, 2);
    // Reverse chronological: most recent week first.
    assert.deepEqual([...grid[0].vals], [8, null, null, null, null, null, null]);
    assert.deepEqual([...grid[1].vals], [1, null, 3, null, null, null, null]);
});

test('calculate_daily_values pulls the configured aggregate per day', () => {
    const card = makeCard({ config: { aggregate: 'max' }, meta: { language: 'en-US' } });
    const grid = card.calculate_daily_values([
        { start: '2024-01-01T12:00:00Z', mean: 2, min: 1, max: 9 }
    ]);
    assert.equal(grid[0].vals[0], 9); // Monday slot holds the max
});

test('calculate_daily_last_values keeps the final recorded hour of each day', () => {
    const card = makeCard({ meta: { language: 'en-US' } });
    const grid = card.calculate_daily_last_values([
        { start: '2024-01-01T00:00:00Z', mean: 1 },
        { start: '2024-01-01T03:00:00Z', mean: 5 },
        { start: '2024-01-01T05:00:00Z', mean: 9 }
    ]);
    assert.equal(grid[0].vals[0], 9); // last hour wins
});

test('calculate_daily_last_values skips hours with a null mean', () => {
    const card = makeCard({ meta: { language: 'en-US' } });
    const grid = card.calculate_daily_last_values([
        { start: '2024-01-01T04:00:00Z', mean: 4 },
        { start: '2024-01-01T05:00:00Z', mean: null }
    ]);
    assert.equal(grid[0].vals[0], 4); // null final hour does not blank the day
});

test('calculate_measurement_values builds one row per date, newest first', () => {
    const card = makeCard({ meta: { language: 'en-US' } });
    const grid = card.calculate_measurement_values([
        { start: '2024-01-01T00:00:00Z', mean: 5 },
        { start: '2024-01-01T01:00:00Z', mean: 6 },
        { start: '2024-01-02T00:00:00Z', mean: 7 }
    ]);
    assert.equal(grid.length, 2);
    // Newest date first; its row is truncated to the last received hour.
    assert.deepEqual([...grid[0].vals], [7]);
    assert.equal(grid[1].vals[0], 5);
    assert.equal(grid[1].vals[1], 6);
});

test('calculate_increasing_values stores hourly deltas and fills gaps with zero', () => {
    const card = makeCard({ meta: { language: 'en-US' } });
    const grid = card.calculate_increasing_values([
        { start: '2024-01-01T00:00:00Z', sum: 0 },
        { start: '2024-01-01T01:00:00Z', sum: 2 },
        { start: '2024-01-01T02:00:00Z', sum: 5 }
    ]);
    // First hour has no prior sum (stays 0); subsequent hours are deltas.
    assert.deepEqual([...grid[0].vals], [0, 2, 3]);
});

test('setConfig applies documented defaults', () => {
    const card = makeCard();
    card.setConfig({ entity: 'sensor.temp' });
    assert.equal(card.config.mode, 'hourly');
    assert.equal(card.config.days, 21);
    assert.equal(card.config.weeks, 12);
    assert.equal(card.config.aggregate, 'mean');
    assert.equal(card.config.operation, 'difference');
    assert.deepEqual({ ...card.config.data }, {});
    assert.deepEqual({ ...card.config.display }, {});
});

test('setConfig rejects invalid configuration', () => {
    const card = makeCard();
    assert.throws(() => card.setConfig({}), /define an entity/);
    assert.throws(() => card.setConfig({ entity: 'sensor.a', days: -5 }), /`days`/);
    assert.throws(() => card.setConfig({ entity: 'sensor.a', weeks: -1 }), /`weeks`/);
    assert.throws(() => card.setConfig({ entity: 'sensor.a', mode: 'weekly' }), /`mode`/);
    assert.throws(() => card.setConfig({ entity: 'sensor.a', aggregate: 'median' }), /`aggregate`/);
    assert.throws(() => card.setConfig({ entity: 'sensor.a', operation: 'divide' }), /`operation`/);
    assert.throws(
        () => card.setConfig({ entity: 'sensor.a', data: { max: 'high' } }),
        /`data.max`/
    );
    assert.throws(
        () => card.setConfig({ entity: 'sensor.a', data: { min: 'low' } }),
        /`data.min`/
    );
});

test('setConfig rejects a secondary entity outside hourly mode', () => {
    const card = makeCard();
    assert.throws(
        () => card.setConfig({ entity: 'sensor.a', secondary_entity: 'sensor.b', mode: 'daily' }),
        /only supported in hourly mode/
    );
});

test('setConfig accepts auto and numeric data bounds', () => {
    const card = makeCard();
    card.setConfig({ entity: 'sensor.a', data: { min: 'auto', max: 14 } });
    assert.equal(card.config.data.min, 'auto');
    assert.equal(card.config.data.max, 14);
});
