import { newId } from "../utils/id.js";
import { assert, asStringOrEmpty, isFiniteNumber } from "../utils/validate.js";
import { RepGroup } from "./repGroup.js";

/**
 * A SetSeries is associated with one exercise and contains:
 * - a sequence of RepGroup objects (each RepGroup can have its own restSecondsAfter)
 * - restSecondsAfter: rest after finishing this SetSeries
 */
export class SetSeries {
    constructor({
        id = newId("ss"),
        description = "",
        exerciseId,
        repGroups = [],
        restSecondsAfter = 0,
    } = {}) {
        this.id = id;
        this.description = asStringOrEmpty(description);
        this.exerciseId = exerciseId;
        this.repGroups = repGroups.map((g) => (g instanceof RepGroup ? g : new RepGroup(g)));
        this.restSecondsAfter = restSecondsAfter;

        this.validate();
    }

    validate() {
        assert(typeof this.id === "string" && this.id.length > 0, "SetSeries.id is required");
        assert(typeof this.description === "string", "SetSeries.description must be a string");
        assert(typeof this.exerciseId === "string" && this.exerciseId.length > 0, "SetSeries.exerciseId is required");

        assert(Array.isArray(this.repGroups), "SetSeries.repGroups must be an array");
        this.repGroups.forEach((g) => {
            assert(g instanceof RepGroup, "SetSeries.repGroups must contain RepGroup instances");
            assert(g.exerciseId === this.exerciseId, "RepGroup.exerciseId must match SetSeries.exerciseId");
            // RepGroup validates its own restSecondsAfter + history internally
        });

        assert(
            isFiniteNumber(this.restSecondsAfter) && this.restSecondsAfter >= 0,
            "SetSeries.restSecondsAfter must be a non-negative number"
        );
    }

    toJSON() {
        return {
            type: "SetSeries",
            id: this.id,
            description: this.description,
            exerciseId: this.exerciseId,
            repGroups: this.repGroups.map((g) => g.toJSON()),
            restSecondsAfter: this.restSecondsAfter,
        };
    }

    static fromJSON(obj) {
        return new SetSeries({
            ...obj,
            repGroups: (obj.repGroups ?? []).map(RepGroup.fromJSON),
        });
    }
}