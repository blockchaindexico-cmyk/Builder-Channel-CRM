import { test as setup } from "@playwright/test";

import { type Persona, signInAndWait, storageStateFor, USERS } from "./support/auth";

/** Signs in once per persona and saves the session for the other projects (M02-20). */
for (const persona of Object.keys(USERS) as Persona[]) {
  setup(`sign in as ${persona}`, async ({ page }) => {
    await signInAndWait(page, USERS[persona].email);
    await page.context().storageState({ path: storageStateFor(persona) });
  });
}
