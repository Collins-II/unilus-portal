import { LeadModel } from "@/lib/database/models";
import { leadInput } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { audit, toLead, today } from "@/lib/server/data";
import { handler, readJson } from "@/lib/server/http";
import { assertVehicleForLead } from "@/lib/server/rules";

export const POST = handler(async (request: Request) => {
  const staff = await requireStaff();
  const input = leadInput.parse(await readJson(request));
  await assertVehicleForLead(input.vehicleId);
  const lead = await LeadModel.create({ ...input, stage: "New", created: today() });
  await audit(staff, "lead.create", `Added lead ${input.name}`, "lead", lead._id.toString());
  return Response.json(toLead(lead.toObject()), { status: 201 });
});