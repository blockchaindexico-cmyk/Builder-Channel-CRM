import { addBuilderContact, createBuilder } from "@/modules/catalog/server/builders";
import { getCatalogOptions } from "@/modules/catalog/server/masters";
import { createProject } from "@/modules/catalog/server/projects";
import { createSystemContext } from "@/platform/tenant/context";

/**
 * Demo builders and projects for development (SEED_DEMO_USERS=true). Created through the catalogue services,
 * so codes, audit entries and events are the same as for data entered in the app. Runs only while the
 * organization has no builders.
 */
export async function seedDemoCatalog(organizationId: string): Promise<boolean> {
  const ctx = createSystemContext(organizationId, { name: "Demo data" });
  if ((await ctx.db.builder.count()) > 0) return false;

  const options = await getCatalogOptions(ctx);
  const id = (list: { id: string; name: string }[], name: string) => {
    const entry = list.find((item) => item.name === name);
    if (!entry)
      throw new Error(`Master "${name}" not found — run the catalogue master seed first.`);
    return entry.id;
  };
  const config = (name: string) => id(options.configurationTypes, name);
  const amenities = (...names: string[]) => names.map((name) => id(options.amenities, name));
  const type = (name: string) => id(options.propertyTypes, name);

  const skyline = await createBuilder(ctx, {
    name: "Skyline Developers",
    code: "SKYLINE",
    legalName: "Skyline Developers Private Limited",
    website: "https://skyline-developers.example",
    email: "sales@skyline-developers.example",
    phone: "+912066000100",
    city: "Pune",
    state: "Maharashtra",
    description:
      "Mid-segment residential developer in east and west Pune; pays brokerage 30 days after registration.",
  });
  await addBuilderContact(ctx, skyline.id, {
    name: "Anil Sharma",
    designation: "Sales Head",
    phone: "+919820011111",
    email: "anil@skyline-developers.example",
    isPrimary: true,
  });
  await addBuilderContact(ctx, skyline.id, {
    name: "Bina Rao",
    designation: "Channel Partner Manager",
    phone: "+919820011112",
  });

  const horizon = await createBuilder(ctx, {
    name: "Horizon Realty",
    code: "HORIZON",
    website: "https://horizon-realty.example",
    city: "Mumbai",
    state: "Maharashtra",
  });
  await addBuilderContact(ctx, horizon.id, {
    name: "Kiran Mehta",
    designation: "VP Sales",
    phone: "+919820022221",
    isPrimary: true,
  });

  await createProject(ctx, {
    builderId: skyline.id,
    name: "Skyline Riverfront",
    status: "UNDER_CONSTRUCTION",
    reraNumber: "P52100045678",
    locality: "Kharadi",
    city: "Pune",
    state: "Maharashtra",
    launchDate: "2025-02-01",
    possessionDate: "2027-12-31",
    possessionNote: "RERA possession Dec 2027",
    totalTowers: 4,
    totalUnits: 520,
    projectArea: "7.5 acres",
    description: "Four river-facing towers next to the EON IT park with a 1-acre central garden.",
    highlights: ["River-facing towers", "5 minutes from EON IT park", "Possession Dec 2027"],
    propertyTypeIds: [type("Apartment")],
    amenityIds: amenities(
      "Swimming Pool",
      "Clubhouse",
      "Gymnasium",
      "Children's Play Area",
      "Covered Parking",
    ),
    configurations: [
      {
        configurationTypeId: config("2 BHK"),
        carpetAreaMin: "680",
        carpetAreaMax: "740",
        priceMin: "92 L",
        priceMax: "99 L",
      },
      {
        configurationTypeId: config("3 BHK"),
        carpetAreaMin: "950",
        carpetAreaMax: "1050",
        priceMin: "1.35 Cr",
        priceMax: "1.5 Cr",
      },
    ],
  });
  await createProject(ctx, {
    builderId: skyline.id,
    name: "Skyline Greens Plots",
    status: "READY_TO_MOVE",
    locality: "Gangapur Road",
    city: "Nashik",
    state: "Maharashtra",
    possessionDate: "2025-06-30",
    description: "Gated plotted development with clear titles and ready infrastructure.",
    highlights: ["Registration-ready plots", "Clear titles"],
    propertyTypeIds: [type("Plot")],
    amenityIds: amenities("Landscaped Garden", "Jogging Track", "24x7 Security"),
    configurations: [
      {
        configurationTypeId: config("Plot"),
        carpetAreaMin: "1200",
        carpetAreaMax: "2400",
        priceMin: "30 L",
        priceMax: "58 L",
      },
    ],
  });
  await createProject(ctx, {
    builderId: horizon.id,
    name: "Horizon Bay Towers",
    status: "PRE_LAUNCH",
    locality: "Andheri West",
    city: "Mumbai",
    state: "Maharashtra",
    launchDate: "2026-11-01",
    possessionDate: "2029-06-30",
    description: "Sea-view towers near the metro with podium amenities.",
    highlights: ["Sea view from the 20th floor", "4 minutes to the metro"],
    propertyTypeIds: [type("Apartment")],
    amenityIds: amenities("Swimming Pool", "Gymnasium", "Multipurpose Hall", "EV Charging"),
    configurations: [
      {
        configurationTypeId: config("1 BHK"),
        carpetAreaMin: "420",
        carpetAreaMax: "460",
        priceMin: "1.1 Cr",
        priceMax: "1.25 Cr",
      },
      {
        configurationTypeId: config("2 BHK"),
        carpetAreaMin: "650",
        carpetAreaMax: "720",
        priceMin: "1.65 Cr",
        priceMax: "1.9 Cr",
      },
    ],
  });
  return true;
}
