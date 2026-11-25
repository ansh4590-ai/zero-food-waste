import crypto from "crypto";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProofUploadParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any;
  taskId: string;
  volunteerId: string;
  proofType: unknown;
  imageBase64: unknown;
}

export async function handleTaskProofUpload({
  supabaseAdmin,
  taskId,
  volunteerId,
  proofType,
  imageBase64,
}: ProofUploadParams): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!UUID_REGEX.test(taskId)) {
    return { status: 400, body: { error: "Invalid taskId format." } };
  }

  if (typeof imageBase64 !== "string" || !imageBase64 || !proofType) {
    return { status: 400, body: { error: "imageBase64 and proof_type are required." } };
  }

  if (proofType !== "pickup" && proofType !== "delivery") {
    return { status: 400, body: { error: "proof_type must be 'pickup' or 'delivery'." } };
  }

  const { data: task, error: taskErr } = await supabaseAdmin
    .from("volunteer_tasks")
    .select("id, volunteer_id, status")
    .eq("id", taskId)
    .eq("volunteer_id", volunteerId)
    .maybeSingle();

  if (taskErr || !task) {
    return { status: 404, body: { error: "Task not found or not assigned to you." } };
  }

  if (proofType === "pickup") {
    if (!["assigned", "pending_acceptance"].includes(task.status)) {
      return {
        status: 409,
        body: { error: `Cannot upload pickup proof: task is in '${task.status}' state, expected 'assigned'.` },
      };
    }
  } else if (task.status !== "picked_up") {
    return {
      status: 409,
      body: { error: `Cannot upload delivery proof: task is in '${task.status}' state, expected 'picked_up'.` },
    };
  }

  const raw = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(raw, "base64");

  if (buffer.length > 3 * 1024 * 1024) {
    return { status: 400, body: { error: "Proof image exceeds 3 MiB size limit." } };
  }

  const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isWebp = buffer.length > 12 && buffer.slice(8, 12).toString("ascii") === "WEBP";

  if (!isJpeg && !isPng && !isWebp) {
    return { status: 400, body: { error: "Invalid image format. Allowed formats: JPEG, PNG, WebP." } };
  }

  const mimeType = isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg";
  const ext = isPng ? "png" : isWebp ? "webp" : "jpg";
  const fileName = `${taskId}/${proofType}_${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("task_proofs")
    .upload(fileName, buffer, { contentType: mimeType, upsert: false });

  if (uploadErr) throw uploadErr;

  const { data: signedData, error: signedErr } = await supabaseAdmin.storage
    .from("task_proofs")
    .createSignedUrl(fileName, 300);

  if (signedErr) {
    console.warn("Could not generate signed URL for proof:", signedErr);
  }

  const proofSignedUrl = signedData?.signedUrl || "";

  const column = proofType === "pickup" ? "pickup_image_url" : "delivery_image_url";
  const expectedStatuses = proofType === "pickup" ? ["assigned", "pending_acceptance"] : ["picked_up"];
  const { data: updatedTask, error: updateErr } = await supabaseAdmin
    .from("volunteer_tasks")
    .update({ [column]: fileName })
    .eq("id", taskId)
    .eq("volunteer_id", volunteerId)
    .in("status", expectedStatuses)
    .select("id")
    .maybeSingle();

  if (updateErr) {
    // Preserve uploaded file on DB/network error because the update may have committed before timeout.
    console.error("Proof task update infrastructure error:", updateErr);
    return {
      status: 503,
      body: {
        error: "Unable to confirm proof update due to a temporary database error. Please refresh before retrying.",
      },
    };
  }

  if (!updatedTask) {
    // Query succeeded with 0 matching rows: task was reassigned or stage changed before commit.
    const { error: removeErr } = await supabaseAdmin.storage.from("task_proofs").remove([fileName]);
    if (removeErr) {
      console.warn("Failed to clean up orphaned proof after 409 conflict:", removeErr);
    }
    return {
      status: 409,
      body: {
        error: "Task was reassigned or its stage changed while uploading proof. Please refresh and try again.",
      },
    };
  }

  return { status: 200, body: { success: true, url: proofSignedUrl, path: fileName } };
}
