'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { deleteMindMapAction } from './[id]/actions';

/** Two clicks to delete: the map, its cards and their history are gone for good. */
export function DeleteMindMapButton({ mapId }: { mapId: string }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={deleteMindMapAction.bind(null, mapId)} className="mind-map-page__delete">
      {confirming ? (
        <>
          <span>Supprimer la carte et tout son historique de révision ?</span>
          <ConfirmButton />
          <button type="button" className="link-button" onClick={() => setConfirming(false)}>
            Annuler
          </button>
        </>
      ) : (
        <button type="button" className="link-button" onClick={() => setConfirming(true)}>
          Supprimer cette carte
        </button>
      )}
    </form>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="danger-button" disabled={pending}>
      {pending ? 'Suppression…' : 'Supprimer'}
    </button>
  );
}
