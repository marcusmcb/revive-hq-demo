import { expect, test } from '@playwright/test';

test('city search shows results (mocked API)', async ({ page }) => {
  await page.route('**/v1/search', async (route, request) => {
    if (request.method() !== 'POST') return route.continue();

    // Give the UI a moment to show the loading state.
    await new Promise((resolve) => setTimeout(resolve, 250));

    const payload = {
      searchId: 'search_e2e_1',
      properties: [
        {
          source: 'repliers',
          sourceId: '1',
          address: '1 Test St, Nashville, TN 37201',
          price: 500000,
          beds: 3,
          baths: 2,
          sqft: 1500,
          photos: []
        }
      ]
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload)
    });
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: /^results$/i })).toHaveCount(0);

  await page.getByLabel(/^city$/i).fill('Nashville');
  await page.getByLabel(/^state$/i).fill('TN');

  await page.getByRole('button', { name: /^search$/i }).click();

  await expect(page.getByRole('heading', { name: /searching/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^results$/i })).toBeVisible();

  await expect(page.getByText(/1 listing\(s\)/i)).toBeVisible();
  await expect(page.getByText(/1 test st/i)).toBeVisible();
});
