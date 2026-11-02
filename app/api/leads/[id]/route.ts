import { LeadModel, VehicleModel } from "@/lib/database/models";
import { leadInput, leadStageInput } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { audit, toLead } from "@/lib/server/data";
import { handler, HttpError, readJson, requireObjectId } from "@/lib/server/http";
import { assertVehicleForLead } from "@/lib/server/rules";

type Context = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, { params }: Context) => {
  const staff = await requireStaff();
  const id = requireObjectId((await params).id, "lead");
  const body = await readJson(request);
  const lead = await LeadModel.findById(id);
  if (!lead) throw new HttpError(404, "This lead has been removed. Refresh the pipeline.");

  if (body && typeof body === "object" && "stage" in body && Object.keys(body).length === 1) {
    const { stage } = leadStageInput.parse(body);
    if (stage === "Won") throw new HttpError(422, "Record a sale to mark a lead as won.");
    if (lead.stage === "Won") throw new HttpError(409, "This lead has already been closed as won.");
    if (stage !== "Lost" && lead.vehicleId && (await VehicleModel.findById(lead.vehicleId).select("status").lean())?.status === "Sold") {
      throw new HttpError(409, "This vehicle has been sold. Edit the lead to choose another vehicle before reopening it.");
    }
    lead.stage = stage;
    await lead.save();
    await audit(staff, "lead.stage", `Moved ${lead.name} to ${stage}`, "lead", id);
    return toLead(lead.toObject());
  }

  const input = leadInput.parse(body);
  const vehicleId = lead.stage === "Won" ? lead.vehicleId : input.vehicleId;
  await assertVehicleForLead(vehicleId, lead.vehicleId);
  lead.set({ ...input, vehicleId });
  await lead.save();
  await audit(staff, "lead.update", `Updated lead ${lead.name}`, "lead", id);
  return toLead(lead.toObject());
});
