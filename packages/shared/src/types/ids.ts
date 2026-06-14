import type { Brand } from './brand';

export type UserId = Brand<string, 'UserId'>;
export type BrunchId = Brand<string, 'BrunchId'>;
export type InviteId = Brand<string, 'InviteId'>;
export type BrunchLocationId = Brand<string, 'BrunchLocationId'>;
export type BrunchTimeId = Brand<string, 'BrunchTimeId'>;

// Not a domain entity ID — a branded primitive for type safety at API boundaries
export type Email = Brand<string, 'Email'>;
export type IanaTimezone = Brand<string, 'IanaTimezone'>;
