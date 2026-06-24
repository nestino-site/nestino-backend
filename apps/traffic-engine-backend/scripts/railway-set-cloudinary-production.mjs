#!/usr/bin/env node
/**
 * Set CLOUDINARY_URL on Railway production via GraphQL (project token).
 *
 *   RAILWAY_API_TOKEN=rw_... \
 *   CLOUDINARY_URL='cloudinary://key:secret@cloud' \
 *   node scripts/railway-set-cloudinary-production.mjs
 */
const TOKEN = process.env.RAILWAY_API_TOKEN ?? process.env.RAILWAY_TOKEN;
const CLOUDINARY_URL = process.env.CLOUDINARY_URL;

const PROJECT_ID = 'f099e6a7-a8c5-4f50-a59e-dd7f46622670';
const ENVIRONMENT_ID = '87b296e1-a47a-40cb-85df-7d72d9a0ec83';
const SERVICE_ID = '8baf64ab-393c-48a0-b6b5-3c4be9a595a0';

async function main() {
  if (!TOKEN) {
    console.error('Missing RAILWAY_API_TOKEN (create at https://railway.com/account/tokens)');
    process.exit(1);
  }
  if (!CLOUDINARY_URL?.startsWith('cloudinary://')) {
    console.error('Set CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name');
    process.exit(1);
  }

  const query = `
    mutation variableUpsert($input: VariableUpsertInput!) {
      variableUpsert(input: $input)
    }
  `;

  const res = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          projectId: PROJECT_ID,
          environmentId: ENVIRONMENT_ID,
          serviceId: SERVICE_ID,
          name: 'CLOUDINARY_URL',
          value: CLOUDINARY_URL,
        },
      },
    }),
  });

  const data = await res.json();
  if (data.errors?.length) {
    console.error('Railway API error:', JSON.stringify(data.errors, null, 2));
    process.exit(1);
  }

  console.log('CLOUDINARY_URL set on traffic-engine-backend (production).');
  console.log('Railway will redeploy automatically — wait ~2 min then run backfill-clinic-photo-cdn-production.mjs');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
