import { newId } from "../utils/id.js";
import { assert, asStringOrEmpty } from "../utils/validate.js";

export class Exercise {
  constructor({ id = newId("ex"), description = "" } = {}) {
    this.id = id;
    this.description = asStringOrEmpty(description);
    this.validate();
  }

  validate() {
    assert(typeof this.id === "string" && this.id.length > 0, "Exercise.id is required");
    assert(typeof this.description === "string", "Exercise.description must be a string");
  }

  toJSON() {
    return { type: "Exercise", id: this.id, description: this.description };
  }

  static fromJSON(obj) {
    return new Exercise(obj);
  }
}