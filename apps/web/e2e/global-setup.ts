import { assertE2eDatabaseUrl } from './support/guard';
import { getE2eDatabaseUrl } from './support/env';

export default function globalSetup(): void {
  assertE2eDatabaseUrl(getE2eDatabaseUrl());
}
