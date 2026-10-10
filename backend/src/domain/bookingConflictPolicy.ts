import { BookingStatus } from '@prisma/client';

export const INSPECTION_BUFFER_MS = 15 * 60 * 1000; // 15 minutes in milliseconds

export interface Interval {
  start: Date;
  end: Date;
}

export interface ExistingBookingInterval extends Interval {
  id: string;
  status: BookingStatus;
}

export class BookingConflictPolicy {
  /**
   * Validates interval sanity:
   * 1. Dates must be valid.
   * 2. start < end.
   * 3. start must be in the future relative to currentTime (unless test override).
   */
  static validateInterval(start: Date, end: Date, currentTime: Date = new Date()): void {
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Start and end must be valid dates');
    }

    if (start.getTime() >= end.getTime()) {
      throw new Error('Booking start time must be strictly before end time');
    }

    if (start.getTime() <= currentTime.getTime()) {
      throw new Error('Booking start time must be in the future');
    }
  }

  /**
   * Conflict logic matching LLD Section 5.1 & Section 11:
   * Intervals are half-open [start, end).
   * A conflict exists if:
   * candidate.start < existing.end + 15m AND existing.start < candidate.end + 15m
   * Cancelled bookings never conflict.
   */
  static conflicts(
    candidate: Interval,
    existing: ExistingBookingInterval
  ): boolean {
    if (existing.status === BookingStatus.CANCELLED) {
      return false;
    }

    const candidateStartMs = candidate.start.getTime();
    const candidateEndMs = candidate.end.getTime();
    const existingStartMs = existing.start.getTime();
    const existingEndMs = existing.end.getTime();

    const existingBufferedEndMs = existingEndMs + INSPECTION_BUFFER_MS;
    const candidateBufferedEndMs = candidateEndMs + INSPECTION_BUFFER_MS;

    // Strict less-than for half-open intervals with inclusive 15-min boundary
    return (
      candidateStartMs < existingBufferedEndMs &&
      existingStartMs < candidateBufferedEndMs
    );
  }

  /**
   * Checks if candidate interval conflicts with any existing booking in the list.
   */
  static findConflicts(
    candidate: Interval,
    existingList: ExistingBookingInterval[]
  ): ExistingBookingInterval[] {
    return existingList.filter((existing) => this.conflicts(candidate, existing));
  }
}
