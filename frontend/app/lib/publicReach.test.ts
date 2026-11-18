import { describe, expect, it } from 'vitest'
import { isPubliclyServed, publicReachBlocker } from './publicReach'

describe('publicReachBlocker mirrors the public API', () => {
  it.each([
    [{ site_published: false, review_status: 'approved', plan_status: 'pilot' }, 'unpublished'],
    [{ site_published: true, review_status: 'draft', plan_status: 'pilot' }, 'not_approved'],
    [{ site_published: true, review_status: 'submitted', plan_status: 'pilot' }, 'not_approved'],
    [{ site_published: true, review_status: 'rejected', plan_status: 'active' }, 'not_approved'],
    [{ site_published: true, review_status: 'approved', plan_status: 'suspended' }, 'inactive'],
    [{ site_published: true, review_status: 'approved', plan_status: 'cancelled' }, 'inactive'],
    [{ site_published: true, review_status: 'approved', plan_status: 'pilot' }, null],
    [{ site_published: true, review_status: 'approved', plan_status: 'active' }, null],
    [{ site_published: true }, null],
  ])('%j → %s', (org, expected) => {
    expect(publicReachBlocker(org)).toBe(expected)
    expect(isPubliclyServed(org)).toBe(expected === null)
  })
})
