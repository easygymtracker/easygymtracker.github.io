import { newId } from "../utils/id.js";
import { assert, asStringOrEmpty, isFiniteNumber } from "../utils/validate.js";

function asFiniteOrNull(value) {
    return isFiniteNumber(value) ? value : null;
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

export class WorkoutSession {
    constructor({
        id = newId("ws"),
        routineId = "",
        routineName = "",
        date = new Date().toISOString(),
        startedAt = null,
        endedAt = new Date().toISOString(),
        durationMs = 0,
        sessionNotes = "",
        rpe = null,
        bodyweightKg = null,
        totals = null,
        exerciseBreakdown = [],
        prDetection = null,
        createdAt = new Date().toISOString(),
    } = {}) {
        this.id = id;
        this.routineId = asStringOrEmpty(routineId);
        this.routineName = asStringOrEmpty(routineName);
        this.date = asStringOrEmpty(date) || new Date().toISOString();
        this.startedAt = startedAt || null;
        this.endedAt = endedAt || this.date;
        this.durationMs = isFiniteNumber(durationMs) ? Math.max(0, Math.round(durationMs)) : 0;
        this.sessionNotes = asStringOrEmpty(sessionNotes);
        this.rpe = asFiniteOrNull(rpe);
        this.bodyweightKg = asFiniteOrNull(bodyweightKg);
        this.totals = {
            sets: Number(totals?.sets ?? 0) || 0,
            reps: Number(totals?.reps ?? 0) || 0,
            volume: Number(totals?.volume ?? 0) || 0,
            exercises: Number(totals?.exercises ?? 0) || 0,
        };
        this.exerciseBreakdown = asArray(exerciseBreakdown).map((item) => ({
            name: asStringOrEmpty(item?.name),
            sets: Number(item?.sets ?? 0) || 0,
            reps: Number(item?.reps ?? 0) || 0,
            volume: Number(item?.volume ?? 0) || 0,
        }));
        this.prDetection = {
            totalPrs: Number(prDetection?.totalPrs ?? 0) || 0,
            byExercise: asArray(prDetection?.byExercise).map((item) => ({
                exercise: asStringOrEmpty(item?.exercise),
                weightPr: Boolean(item?.weightPr),
                repsPr: Boolean(item?.repsPr),
                volumePr: Boolean(item?.volumePr),
            })),
        };
        this.createdAt = createdAt || new Date().toISOString();

        this.validate();
    }

    validate() {
        assert(typeof this.id === "string" && this.id.length > 0, "WorkoutSession.id is required");
        assert(typeof this.date === "string" && this.date.length > 0, "WorkoutSession.date is required");
        assert(isFiniteNumber(this.durationMs) && this.durationMs >= 0, "WorkoutSession.durationMs must be non-negative");
        assert(this.rpe === null || (isFiniteNumber(this.rpe) && this.rpe >= 0 && this.rpe <= 10), "WorkoutSession.rpe must be null or 0-10");
        assert(this.bodyweightKg === null || (isFiniteNumber(this.bodyweightKg) && this.bodyweightKg > 0), "WorkoutSession.bodyweightKg must be null or positive");
    }

    toJSON() {
        return {
            type: "WorkoutSession",
            id: this.id,
            routineId: this.routineId,
            routineName: this.routineName,
            date: this.date,
            startedAt: this.startedAt,
            endedAt: this.endedAt,
            durationMs: this.durationMs,
            sessionNotes: this.sessionNotes,
            rpe: this.rpe,
            bodyweightKg: this.bodyweightKg,
            totals: this.totals,
            exerciseBreakdown: this.exerciseBreakdown,
            prDetection: this.prDetection,
            createdAt: this.createdAt,
        };
    }

    static fromJSON(obj) {
        return new WorkoutSession(obj);
    }
}
