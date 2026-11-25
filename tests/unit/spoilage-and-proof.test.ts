import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSpoilageRisk } from "../../server/spoilage.ts";
import { handleTaskProofUpload } from "../../server/proofUpload.ts";

const VALID_PNG_BASE64 =
  "data:image/png;base64," +
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]).toString("base64");

test("spoilage: cooked_meal held at 22C ambient for 3 hours returns unknown and null", () => {
  const now = Date.UTC(2026, 10, 25, 12, 0, 0);
  const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000).toISOString();

  const res = evaluateSpoilageRisk(
    {
      food_type: "cooked_meal",
      storage_type: "ambient",
      current_temperature_celsius: 22,
      travel_distance_km: 5,
      preparation_time: threeHoursAgo,
    },
    now
  );

  assert.equal(res.status, 200);
  if (res.status === 200) {
    assert.equal(res.body.spoilage_risk, "unknown");
    assert.equal(res.body.estimated_safe_hours, null);
  }
});

test("spoilage: refrigerated submission with inconsistent temperature (>4C) returns unknown and null", () => {
  const now = Date.UTC(2026, 10, 25, 12, 0, 0);
  const oneHourAgo = new Date(now - 1 * 60 * 60 * 1000).toISOString();

  const res = evaluateSpoilageRisk(
    {
      food_type: "cooked_meal",
      storage_type: "refrigerated",
      current_temperature_celsius: 18,
      preparation_time: oneHourAgo,
    },
    now
  );

  assert.equal(res.status, 200);
  if (res.status === 200) {
    assert.equal(res.body.spoilage_risk, "unknown");
    assert.equal(res.body.estimated_safe_hours, null);
  }
});

test("spoilage: refrigerated submission with verified <=4C temperature returns remaining safe hours", () => {
  const now = Date.UTC(2026, 10, 25, 12, 0, 0);
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();

  const res = evaluateSpoilageRisk(
    {
      food_type: "cooked_meal",
      storage_type: "refrigerated",
      current_temperature_celsius: 3,
      preparation_time: twoHoursAgo,
    },
    now
  );

  assert.equal(res.status, 200);
  if (res.status === 200) {
    assert.equal(res.body.spoilage_risk, "low");
    assert.equal(res.body.estimated_safe_hours, 46);
  }
});

function createMockSupabaseForProof({ updateResult }: { updateResult: { data: unknown; error: unknown } }) {
  const removedFiles: string[][] = [];
  let uploadedPath: string | null = null;
  let uploadedOptions: Record<string, unknown> | null = null;

  const supabaseAdmin = {
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, "task_proofs");
        return {
          upload: async (path: string, _buf: Buffer, options: Record<string, unknown>) => {
            uploadedPath = path;
            uploadedOptions = options;
            return { error: null };
          },
          createSignedUrl: async () => ({ data: { signedUrl: "https://example.com/signed" }, error: null }),
          remove: async (paths: string[]) => {
            removedFiles.push(paths);
            return { error: null };
          },
        };
      },
    },
    from: (table: string) => {
      assert.equal(table, "volunteer_tasks");
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "11111111-1111-4111-8111-111111111111", volunteer_id: "vol-1", status: "assigned" },
                error: null,
              }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              in: () => ({
                select: () => ({
                  maybeSingle: async () => updateResult,
                }),
              }),
            }),
          }),
        }),
      };
    },
  };

  return {
    supabaseAdmin,
    getUploadedPath: () => uploadedPath,
    getUploadedOptions: () => uploadedOptions,
    getRemovedFiles: () => removedFiles,
  };
}

test("proof upload: zero-row conditional update returns 409 and removes uploaded file", async () => {
  const mock = createMockSupabaseForProof({ updateResult: { data: null, error: null } });

  const res = await handleTaskProofUpload({
    supabaseAdmin: mock.supabaseAdmin,
    taskId: "11111111-1111-4111-8111-111111111111",
    volunteerId: "vol-1",
    proofType: "pickup",
    imageBase64: VALID_PNG_BASE64,
  });

  assert.equal(res.status, 409);
  assert.equal(mock.getUploadedOptions()?.upsert, false);
  const uploaded = mock.getUploadedPath();
  assert.ok(uploaded);
  assert.deepEqual(mock.getRemovedFiles(), [[uploaded]]);
});

test("proof upload: ambiguous database error returns 503 and retains uploaded file", async () => {
  const mock = createMockSupabaseForProof({
    updateResult: { data: null, error: { message: "statement timeout" } },
  });

  const res = await handleTaskProofUpload({
    supabaseAdmin: mock.supabaseAdmin,
    taskId: "11111111-1111-4111-8111-111111111111",
    volunteerId: "vol-1",
    proofType: "pickup",
    imageBase64: VALID_PNG_BASE64,
  });

  assert.equal(res.status, 503);
  assert.deepEqual(mock.getRemovedFiles(), []);
});
