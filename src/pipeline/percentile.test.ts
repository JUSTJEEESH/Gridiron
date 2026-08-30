import { describe, expect, it } from 'vitest'
import { median, percentiles, zscores } from './percentile.ts'

describe('percentiles', () => {
  it('maps best to 100, worst to 0, evenly spaced when distinct', () => {
    expect(percentiles([10, 20, 30, 40, 50])).toEqual([0, 25, 50, 75, 100])
  })

  it('is order-independent (returns scores in input order)', () => {
    expect(percentiles([50, 10, 40, 20, 30])).toEqual([100, 0, 75, 25, 50])
  })

  it('gives ties identical scores at the mean of their ranks', () => {
    // ranks: 10 -> 1, the 20s -> mean(2,3) = 2.5, 30 -> 4
    // scores: 0, 50, 50, 100
    expect(percentiles([10, 20, 20, 30])).toEqual([0, 50, 50, 100])
  })

  it('all-equal cohort scores everyone 50', () => {
    expect(percentiles([7, 7, 7])).toEqual([50, 50, 50])
  })

  it('cohort of one scores 50', () => {
    expect(percentiles([123])).toEqual([50])
  })

  it('cohort of two scores 0 and 100', () => {
    expect(percentiles([5, 9])).toEqual([0, 100])
  })

  it('empty cohort gives empty result', () => {
    expect(percentiles([])).toEqual([])
  })

  it('handles negative and fractional values', () => {
    expect(percentiles([-1.5, 0, 2.25])).toEqual([0, 50, 100])
  })

  it('matches a hand-computed larger case with a tie cluster', () => {
    // sorted: 1,3,3,3,8,9 -> ranks 1, mean(2,3,4)=3, 5, 6
    // scores: (r-1)/5*100
    expect(percentiles([3, 1, 9, 3, 3, 8])).toEqual([40, 0, 100, 40, 40, 80])
  })
})

describe('median', () => {
  it('odd length', () => {
    expect(median([5, 1, 9])).toBe(5)
  })
  it('even length averages the middle pair', () => {
    expect(median([1, 2, 3, 10])).toBe(2.5)
  })
  it('does not mutate its input', () => {
    const v = [3, 1, 2]
    median(v)
    expect(v).toEqual([3, 1, 2])
  })
  it('throws on empty input', () => {
    expect(() => median([])).toThrow()
  })
})

describe('zscores', () => {
  it('centers and scales', () => {
    const z = zscores([1, 2, 3])
    expect(z[1]).toBeCloseTo(0)
    expect(z[0]).toBeCloseTo(-z[2])
    expect(z[2]).toBeGreaterThan(0)
  })
  it('constant distribution gives all zeros', () => {
    expect(zscores([4, 4, 4])).toEqual([0, 0, 0])
  })
})
