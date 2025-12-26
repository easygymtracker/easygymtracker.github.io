import { newId } from "../utils/id.js";
import { assert, asStringOrEmpty } from "../utils/validate.js";
import { SetSeries } from "./setSeries.js";

export class Routine {
  constructor({
    id = newId("rt"),
    description = "",
    series = [], // ordered sequence of SetSeries
  } = {}) {
    this.id = id;
    this.description = asStringOrEmpty(description);
    this.series = series.map((s) => (s instanceof SetSeries ? s : new SetSeries(s)));

    this.validate();
  }

  validate() {
    assert(typeof this.id === "string" && this.id.length > 0, "Routine.id is required");
    assert(typeof this.description === "string", "Routine.description must be a string");

    assert(Array.isArray(this.series), "Routine.series must be an array");
    this.series.forEach((s) => {
      assert(s instanceof SetSeries, "Routine.series must contain SetSeries instances");
    });
  }

  toJSON() {
    return {
      type: "Routine",
      id: this.id,
      description: this.description,
      series: this.series.map((s) => s.toJSON()),
    };
  }

  static fromJSON(obj) {
    return new Routine({
      ...obj,
      series: (obj.series ?? []).map(SetSeries.fromJSON),
    });
  }
}