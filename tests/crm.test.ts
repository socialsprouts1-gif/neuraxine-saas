import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  crmContactFromRow,
  escapeSoql,
  hubspotProperties,
  isCrmProvider,
  salesforceLead,
  splitName,
  toE164,
  zohoLead,
  type CrmContact,
} from "../src/lib/crm.ts";

function contact(overrides: Partial<CrmContact> = {}): CrmContact {
  return {
    waId: "919876543210",
    name: "Ravi Kumar",
    email: "ravi@example.com",
    company: "Kumar Textiles",
    leadStage: "qualified",
    source: "Facebook Lead Ads",
    leadScore: 72,
    tags: ["vip"],
    ...overrides,
  };
}

describe("toE164", () => {
  it("puts the plus back on a wa_id", () => {
    assert.equal(toE164("919876543210"), "+919876543210");
  });

  it("strips anything that is not a digit", () => {
    assert.equal(toE164("+91 98765-43210"), "+919876543210");
  });

  it("returns empty rather than a lone plus", () => {
    assert.equal(toE164(""), "");
    assert.equal(toE164("---"), "");
  });
});

describe("splitName", () => {
  it("keeps a middle name with the surname", () => {
    assert.deepEqual(splitName("Ravi Kumar Sharma", "x"), {
      firstName: "Ravi",
      lastName: "Kumar Sharma",
    });
  });

  it("puts a single word in the surname, which is the required one", () => {
    assert.deepEqual(splitName("Ravi", "x"), { firstName: "", lastName: "Ravi" });
  });

  it("falls back when there is no name at all", () => {
    assert.deepEqual(splitName(null, "+919876543210"), {
      firstName: "",
      lastName: "+919876543210",
    });
    assert.deepEqual(splitName("   ", "+91"), { firstName: "", lastName: "+91" });
  });

  it("collapses repeated spaces rather than making a blank first name", () => {
    assert.deepEqual(splitName("  Ravi   Kumar ", "x"), {
      firstName: "Ravi",
      lastName: "Kumar",
    });
  });
});

describe("hubspotProperties", () => {
  it("maps the fields HubSpot expects", () => {
    const { properties } = hubspotProperties(contact());
    assert.equal(properties.phone, "+919876543210");
    assert.equal(properties.firstname, "Ravi");
    assert.equal(properties.lastname, "Kumar");
    assert.equal(properties.email, "ravi@example.com");
    assert.equal(properties.company, "Kumar Textiles");
    assert.equal(properties.lifecyclestage, "marketingqualifiedlead");
  });

  it("omits fields we do not have rather than sending empty strings", () => {
    const { properties } = hubspotProperties(
      contact({ name: null, email: null, company: null })
    );
    assert.equal("email" in properties, false);
    assert.equal("company" in properties, false);
    assert.equal("firstname" in properties, false);
    // The phone number stands in for the name, so the record is findable.
    assert.equal(properties.lastname, "+919876543210");
  });

  it("falls back to a known lifecycle stage for an unmapped one", () => {
    const { properties } = hubspotProperties(contact({ leadStage: "invented" }));
    assert.equal(properties.lifecyclestage, "subscriber");
  });
});

describe("zohoLead", () => {
  it("deduplicates on phone, which is what makes two contacts the same person", () => {
    const payload = zohoLead(contact());
    assert.deepEqual(payload.duplicate_check_fields, ["Phone"]);
  });

  it("always has a Last_Name and a Company, both of which Zoho requires", () => {
    const [record] = zohoLead(contact({ name: null, company: null })).data;
    assert.equal(record.Last_Name, "+919876543210");
    assert.equal(record.Company, "+919876543210");
  });

  it("uses the contact's own name as the company when there isn't one", () => {
    const [record] = zohoLead(contact({ company: null })).data;
    assert.equal(record.Company, "Ravi Kumar");
  });

  it("records where the lead came from", () => {
    const [record] = zohoLead(contact()).data;
    assert.equal(record.Lead_Source, "WhatsApp · Facebook Lead Ads");

    const [plain] = zohoLead(contact({ source: null })).data;
    assert.equal(plain.Lead_Source, "WhatsApp");
  });

  it("sends tags in Zoho's shape, not as bare strings", () => {
    const [record] = zohoLead(contact({ tags: ["vip", "repeat"] })).data;
    assert.deepEqual(record.Tag, [{ name: "vip" }, { name: "repeat" }]);
  });

  it("leaves an unmapped lead stage off rather than failing the record", () => {
    const [record] = zohoLead(contact({ leadStage: "invented" })).data;
    assert.equal("Lead_Status" in record, false);
  });
});

describe("salesforceLead", () => {
  it("always has the two fields Salesforce refuses a Lead without", () => {
    const record = salesforceLead(contact({ name: null, company: null }));
    assert.equal(record.LastName, "+919876543210");
    assert.equal(record.Company, "+919876543210");
  });

  it("maps our stages onto Salesforce's status picklist", () => {
    assert.equal(salesforceLead(contact({ leadStage: "won" })).Status, "Closed - Converted");
    assert.equal(salesforceLead(contact({ leadStage: "new" })).Status, "Open - Not Contacted");
    assert.equal("Status" in salesforceLead(contact({ leadStage: "invented" })), false);
  });

  it("fills both phone fields, because Salesforce searches them separately", () => {
    const record = salesforceLead(contact());
    assert.equal(record.Phone, "+919876543210");
    assert.equal(record.MobilePhone, "+919876543210");
  });
});

describe("escapeSoql", () => {
  it("escapes the quote that would otherwise end the literal", () => {
    assert.equal(escapeSoql("O'Brien"), "O\\'Brien");
  });

  it("escapes the backslash that would otherwise hide the quote", () => {
    assert.equal(escapeSoql("a\\'"), "a\\\\\\'");
  });

  it("leaves an ordinary phone number alone", () => {
    assert.equal(escapeSoql("+919876543210"), "+919876543210");
  });
});

describe("crmContactFromRow", () => {
  it("finds an email under any of the names people give the column", () => {
    assert.equal(
      crmContactFromRow({ wa_id: "91", custom_fields: { Email: "a@b.com" } }).email,
      "a@b.com"
    );
    assert.equal(
      crmContactFromRow({ wa_id: "91", custom_fields: { email_address: "c@d.com" } }).email,
      "c@d.com"
    );
  });

  it("ignores a blank or non-string custom field", () => {
    const result = crmContactFromRow({
      wa_id: "91",
      custom_fields: { email: "   ", company: 42 as unknown as string },
    });
    assert.equal(result.email, null);
    assert.equal(result.company, null);
  });

  it("survives a row with nothing but a wa_id", () => {
    const result = crmContactFromRow({ wa_id: "919876543210" });
    assert.equal(result.waId, "919876543210");
    assert.equal(result.name, null);
    assert.deepEqual(result.tags, []);
    assert.equal(result.leadScore, null);
  });
});

describe("isCrmProvider", () => {
  it("accepts the three that can actually be pushed to", () => {
    assert.equal(isCrmProvider("hubspot"), true);
    assert.equal(isCrmProvider("zoho-crm"), true);
    assert.equal(isCrmProvider("salesforce"), true);
  });

  it("rejects a CRM-category entry that has no push implementation", () => {
    // Both are in the CRM category of the catalogue but neither can be
    // written to, so neither may reach the sync path.
    assert.equal(isCrmProvider("indiamart"), false);
    assert.equal(isCrmProvider("facebook-lead-ads"), false);
  });
});
