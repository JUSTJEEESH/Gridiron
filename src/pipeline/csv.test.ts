import { describe, expect, it } from 'vitest'
import { num, parseCsv, parseCsvRecords } from './csv.ts'

describe('parseCsv', () => {
  it('parses plain rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles quoted fields with commas and escaped quotes', () => {
    expect(parseCsv('name,note\n"Smith, John","said ""hi"""')).toEqual([
      ['name', 'note'],
      ['Smith, John', 'said "hi"'],
    ])
  })

  it('handles newlines inside quoted fields and CRLF line endings', () => {
    expect(parseCsv('a,b\r\n"line1\nline2",x\r\n')).toEqual([
      ['a', 'b'],
      ['line1\nline2', 'x'],
    ])
  })

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']])
  })
})

describe('parseCsvRecords', () => {
  it('keys rows by header and skips blank trailing lines', () => {
    expect(parseCsvRecords('x,y\n1,2\n\n')).toEqual([{ x: '1', y: '2' }])
  })
  it('fills missing trailing columns with empty strings', () => {
    expect(parseCsvRecords('x,y,z\n1,2')).toEqual([{ x: '1', y: '2', z: '' }])
  })
})

describe('num', () => {
  it('parses numbers and treats blank/NA/garbage as 0', () => {
    expect(num('16.5')).toBe(16.5)
    expect(num('0.358736059479554')).toBeCloseTo(0.3587, 4)
    expect(num('')).toBe(0)
    expect(num('NA')).toBe(0)
    expect(num(undefined)).toBe(0)
    expect(num('abc')).toBe(0)
  })
})
