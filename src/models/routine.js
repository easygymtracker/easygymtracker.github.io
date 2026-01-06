// models/routine.js

import { newId } from "../utils/id.js";
import { assert, asStringOrEmpty } from "../utils/validate.js";
import { SetSeries } from "./setSeries.js";

export class Routine {
    constructor({
        id = newId("rt"),
        name = "",
        description = "",
        series = [], // ordered sequence of SetSeries
    } = {}) {
        this.id = id;
        this.name = asStringOrEmpty(name);
        this.description = asStringOrEmpty(description);
        this.series = series.map((s) => (s instanceof SetSeries ? s : new SetSeries(s)));

        this.validate();
    }

    validate() {
        assert(typeof this.id === "string" && this.id.length > 0, "Routine.id is required");
        assert(typeof this.name === "string", "Routine.name must be a string");
        assert(this.name.trim().length > 0, "Routine.name is required");
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
            name: this.name,
            description: this.description,
            series: this.series.map((s) => s.toJSON()),
        };
    }

    static fromJSON(obj) {
        // Backward compatibility:
        // - old schema had only `description` (used as the title/name)
        // - new schema has `name` and `description`
        const name =
            typeof obj?.name === "string" && obj.name.trim().length > 0
                ? obj.name
                : asStringOrEmpty(obj?.description); // fallback: old "description" as name

        const description =
            typeof obj?.name === "string"
                ? asStringOrEmpty(obj?.description) // normal new schema
                : ""; // if old schema, keep description empty by default

        return new Routine({
            ...obj,
            name,
            description,
            series: (obj?.series ?? []).map(SetSeries.fromJSON),
        });
    }
}