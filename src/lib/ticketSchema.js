// Shared ticket JSON schema + master-mechanic prompt builder.
// Used by generateTicket, askMechanic, rerankCauses.

export const TICKET_SCHEMA = {
  type: "object",
  properties: {
    header: {
      type: "object",
      properties: {
        vehicle_summary: { type: "string" },
        symptoms: { type: "string" },
        dtcs: { type: "string" },
        system_focus: { type: "string" }
      },
      required: ["vehicle_summary", "symptoms"]
    },
    flowchart: {
      type: "object",
      properties: {
        title: { type: "string" },
        nodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              question: { type: "string" },
              yes_id: { type: "string" },
              no_id: { type: "string" },
              yes_label: { type: "string" },
              no_label: { type: "string" },
              outcome: { type: "string" },
              is_outcome: { type: "boolean" }
            },
            required: ["id", "label"]
          }
        }
      },
      required: ["title", "nodes"]
    },
    module1: {
      type: "object",
      properties: {
        specs: {
          type: "array",
          items: { type: "object", properties: { component: { type: "string" }, value: { type: "string" } }, required: ["component", "value"] }
        },
        root_causes: {
          type: "array",
          items: { type: "object", properties: { cause: { type: "string" }, likelihood: { type: "string" }, explanation: { type: "string" } }, required: ["cause", "likelihood"] }
        },
        diagnostic_tests: {
          type: "array",
          items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, expected_reading: { type: "string" }, category: { type: "string" } }, required: ["id", "name", "expected_reading"] }
        },
        circuit_tests: {
          type: "array",
          items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, wire_color: { type: "string" }, location: { type: "string" }, expected_value: { type: "string" } }, required: ["id", "label", "wire_color", "expected_value"] }
        }
      },
      required: ["specs", "root_causes", "diagnostic_tests"]
    },
    module2: {
      type: "object",
      properties: {
        phases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              steps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    instruction: { type: "string" },
                    torque_spec: { type: "string" },
                    tool_size: { type: "string" },
                    safety_warning: { type: "string" },
                    parts_needed: { type: "array", items: { type: "string" } },
                    diagram_hint: { type: "string" }
                  },
                  required: ["id", "instruction"]
                }
              }
            },
            required: ["name", "steps"]
          }
        }
      },
      required: ["phases"]
    },
    module3: {
      type: "object",
      properties: {
        components: {
          type: "array",
          items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, location: { type: "string" }, tool_needed: { type: "string" } }, required: ["id", "name", "location"] }
        }
      },
      required: ["components"]
    },
    module4: {
      type: "object",
      properties: {
        recommendations: {
          type: "array",
          items: { type: "object", properties: { job: { type: "string" }, reason: { type: "string" }, overlap: { type: "string" } }, required: ["job", "reason"] }
        }
      },
      required: ["recommendations"]
    },
    parts_list: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "string" }, is_tool: { type: "boolean" } }, required: ["name"] }
    },
    safety_warnings: {
      type: "array",
      items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, text: { type: "string" } }, required: ["id", "title", "text"] }
    },
    belt_routing: {
      type: "object",
      properties: {
        needed: { type: "boolean" },
        pulleys: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, type: { type: "string" } }, required: ["id", "name"] } }
      }
    }
  },
  required: ["header", "flowchart", "module1", "module2", "module3", "module4", "parts_list", "safety_warnings"]
};

export const MASTER_PROMPT = `You are a master ASE-certified mechanic with decades of experience. You are "AuroraOS Master Mechanic" powering "Auto-Hustle AI Mechanic".
Rules:
- Be specific to the EXACT year, make, model, trim, and engine given. Never give generic advice.
- Always put cheap, easy checks BEFORE expensive parts replacements.
- Always include safety warnings where relevant (battery disconnect order, fuel system pressure, airbags, jack stands, hot exhaust).
- If you are NOT confident about a spec or layout for this exact vehicle, say "Typical layout, verify on your vehicle" instead of guessing.
- Format every response in the four-module ticket structure.
- Keep readings concrete with units (e.g. "12.4V", "0.5 ohms", "18 ft-lbs").
- Number diagnostic tests, circuit test points, and component locations so they match diagrams.`;

export function buildTicketPrompt(vehicle, symptoms, dtcs) {
  const vehicleLine = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.engine].filter(Boolean).join(' ');
  const mileageLine = vehicle.mileage ? `Mileage: ${vehicle.mileage}` : 'Mileage: unknown';
  return `${MASTER_PROMPT}

Generate a complete Diagnostic Shop Ticket as JSON for this vehicle:
Vehicle: ${vehicleLine}
${mileageLine}
Symptoms: ${symptoms}
DTCs: ${dtcs || 'None provided'}

Produce ALL of the following:
- header: vehicle_summary, symptoms, dtcs, system_focus (the system this diagnosis targets).
- flowchart: a decision-tree for the symptom. Start with a clear first test question. Each node has id, label, question, yes_id/no_id (ids of next nodes), yes_label/no_label (short branch labels), and is_outcome true with an outcome string for terminal nodes. Make 5-9 nodes. Lead with the cheapest check.
- module1.specs: quick-reference spec table (component/value) for this vehicle/system.
- module1.root_causes: ranked most-to-least likely, each with likelihood (High/Medium/Low) and explanation.
- module1.diagnostic_tests: ordered tests, each with id (T1, T2...), name, description, expected_reading, category.
- module1.circuit_tests: for the key circuit, test points with id (C1, C2...), label, wire_color, location, expected_value.
- module2.phases: granular step-by-step repair split into phases (e.g. "Prep & Safety", "Access", "Replace", "Reassemble & Verify"). Each step: id (S1...), instruction, torque_spec (if any), tool_size (if any), safety_warning (if any), parts_needed (array), diagram_hint (short description of what an illustration should show, e.g. "arrow on the two upper alternator bolts").
- module3.components: each with id (L1, L2...) matching callouts, name, location, tool_needed.
- module4.recommendations: overlapping/preventive jobs worth doing while the area is open, with reason and overlap note.
- parts_list: auto-built from the repair steps — parts AND tools, with quantity and is_tool flag.
- safety_warnings: each with id (W1...), title, text.
- belt_routing: needed=true if a serpentine belt is involved, with pulleys array (id, name, type: crank/alternator/tensioner/idler/ps/water/AC).`;
}
