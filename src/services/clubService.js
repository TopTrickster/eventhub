// Clubs. Only an organizer may own one; nobody may act on a club they do not own.
import { insertClub, listClubsByOwner } from '../data/clubsRepo.js';
import { requireOrganizer } from './access.js';
import { checkText, throwIfInvalid } from './validation.js';

const ORGANIZERS_ONLY = 'Само организатори могат да създават клубове.';

const toPublicClub = ({ id, name, description }) => ({ id, name, description });

export function createClubService({ pool }) {
  return {
    async createClub(currentUser, input) {
      requireOrganizer(currentUser, ORGANIZERS_ONLY);
      const errors = {};
      const name = checkText(errors, 'name', input.name, { min: 3, max: 100, label: 'Името на клуба' });
      const description = checkText(errors, 'description', input.description ?? '', {
        min: 0,
        max: 1000,
        label: 'Описанието на клуба',
      });
      throwIfInvalid(errors);
      return toPublicClub(await insertClub(pool, { ownerId: currentUser.id, name, description }));
    },

    async listMine(currentUser) {
      requireOrganizer(currentUser, ORGANIZERS_ONLY);
      return (await listClubsByOwner(pool, currentUser.id)).map(toPublicClub);
    },
  };
}
