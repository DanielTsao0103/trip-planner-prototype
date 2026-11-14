import React, { useEffect, useRef, useState } from "react";
import { Bookmark, Plus, Trash2, ArrowRight } from "lucide-react";
import { useApp } from "./state";
import { member, uid, savedPlaceVersion, type SavedPlace } from "./domain";
import { TEXT_LIMITS, textError } from "./limits";
import { Button, ConfirmDialog, ErrorBox, Field, Modal } from "./ui";
import { EventLocationInput } from "./event-location-input";

/** Unscheduled ideas use the existing trip transaction and recovery journal. */
export function SavedPlaces({ date, view = "list" }: { date: string; view?: "calendar" | "list" | "map" }) {
  const { trip, s, updateTrip, go } = useApp();
  const [discarding, setDiscarding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState<SavedPlace>();
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [point, setPoint] = useState<SavedPlace["point"]>(null);
  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const restoreHeading = useRef(false);
  useEffect(() => {
    if (removing || !restoreHeading.current) return;
    restoreHeading.current = false;
    heading.current?.focus();
  }, [removing]);
  if (!trip) return null;
  const role = member(trip, s.userId)?.role;
  const allowed = role === "Owner" || role === "Editor";
  const places = trip.savedPlaces ?? [];
  const close = () => {
    if (name || place || notes) setDiscarding(true);
    else setEditing(false);
  };
  return (
    <section className="saved-places" aria-label="Saved places">
      <div className="section-title">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            <Bookmark size={18} /> Saved places{" "}
            <span className="muted">{places.length}</span>
          </h2>
          <p>Collect ideas now. Choose a day when you’re ready.</p>
        </div>
        <div className="row">
          {places.length > 0 && (
            <Button
              variant="text"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Hide places" : "Show places"}
            </Button>
          )}
          {allowed && (
            <Button
              ref={addButton}
              variant="outline"
              onClick={() => {
                addButton.current?.focus({ preventScroll: true });
                setName("");
                setPlace("");
                setPoint(null);
                setGooglePlaceId(null);
                setNotes("");
                setError("");
                setEditing(true);
              }}
            >
              <Plus size={16} /> Save a place
            </Button>
          )}
        </div>
      </div>
      <ErrorBox text={notice} />
      {expanded &&
        places.map((item) => (
          <div className="saved-place-row" key={item.id}>
            <div>
              <h3>{item.name}</h3>
              <p>{item.place}</p>
              {item.notes && <p>{item.notes}</p>}
            </div>
            {allowed && (
              <>
                <Button
                  variant="outline"
                  onClick={() =>
                    go(7, { savedPlace: item.id, date, ...(view === "map" ? {return:"11"} : {view}) })
                  }
                >
                  Schedule <ArrowRight size={15} />
                </Button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove saved place ${item.name}`}
                  onClick={() => {
                    setNotice("");
                    setRemoving(item);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
        ))}
      {editing && (
        <Modal title="Save a place" onClose={close}>
          <form
            className="saved-place-form"
            onSubmit={(event) => {
              event.preventDefault();
              const problem =
                textError(name, "Place name", TEXT_LIMITS.eventName, true) ||
                textError(place, "Location", TEXT_LIMITS.eventAddress, true) ||
                textError(notes, "Notes", TEXT_LIMITS.notes);
              if (problem) {
                setError(problem);
                return;
              }
              if (!allowed) {
                setError("Only the owner and editors can change saved places.");
                return;
              }
              if (places.length >= 200) {
                setError(
                  "This trip has 200 saved places. Schedule or remove one first.",
                );
                return;
              }
              let applied = false;
              updateTrip((current) => {
                if (
                  !["Owner", "Editor"].includes(
                    member(current, s.userId)?.role ?? "",
                  ) ||
                  (current.savedPlaces?.length ?? 0) >= 200
                )
                  return;
                current.savedPlaces = [
                  ...(current.savedPlaces ?? []),
                  {
                    id: uid(),
                    name: name.trim(),
                    place: place.trim(),
                    notes: notes.trim(),
                    point,
                    googlePlaceId,
                  },
                ];
                applied = true;
              });
              if (!applied) {
                setError(
                  "The trip changed. Reopen saved places and try again.",
                );
                return;
              }
              setExpanded(true);
              setEditing(false);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                event.target instanceof HTMLInputElement
              )
                event.preventDefault();
            }}
          >
            <Field label="Place name">
              <input
                maxLength={TEXT_LIMITS.eventName}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
              />
            </Field>
            <EventLocationInput
              value={place}
              destinations={trip.destinations}
              onChange={(value, coordinates, id) => {
                setPlace(value);
                setPoint(coordinates ?? null);
                setGooglePlaceId(id ?? null);
              }}
            />
            <Field label="Notes (optional)">
              <textarea
                maxLength={TEXT_LIMITS.notes}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
            <ErrorBox text={error} />
            <div className="form-actions">
              <Button variant="outline" type="button" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">Save place</Button>
            </div>
          </form>
        </Modal>
      )}
      {discarding && (
        <ConfirmDialog
          title="Discard saved place?"
          onCancel={() => setDiscarding(false)}
          onConfirm={() => {
            setDiscarding(false);
            setEditing(false);
          }}
        >
          <p>Your unsaved place details will be discarded.</p>
        </ConfirmDialog>
      )}
      {removing && (
        <ConfirmDialog
          title="Remove saved place?"
          confirmLabel="Remove place"
          onCancel={() => setRemoving(undefined)}
          onConfirm={() => {
            let applied = false;
            updateTrip((current) => {
              const target = current.savedPlaces?.find(
                (place) => place.id === removing.id,
              );
              if (
                !["Owner", "Editor"].includes(
                  member(current, s.userId)?.role ?? "",
                ) ||
                savedPlaceVersion(target) !== savedPlaceVersion(removing)
              )
                return;
              current.savedPlaces = (current.savedPlaces ?? []).filter(
                (place) => place.id !== removing.id,
              );
              applied = true;
            });
            if (!applied)
              setNotice(
                "This place or your access changed. Review the latest list before removing it.",
              );
            restoreHeading.current = true;
            setRemoving(undefined);
          }}
        >
          <p>{removing.name} will be removed from this trip’s ideas.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
