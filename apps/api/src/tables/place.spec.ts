import { BadRequestException } from '@nestjs/common';
import { changesPlace, placeColumns } from './place';

describe('competition location', () => {
  it('keeps a picked place with its name and address', () => {
    expect(placeColumns({ venue: '  Main gate ', address: 'Lekki, Lagos', latitude: 6.44, longitude: 3.53 }))
      .toEqual({ venue: 'Main gate', address: 'Lekki, Lagos', latitude: 6.44, longitude: 3.53 });
  });

  it('is optional: nothing set means no location', () => {
    expect(placeColumns({})).toEqual({ venue: null, address: null, latitude: null, longitude: null });
  });

  it('needs the pin, not just a name, and both coordinates', () => {
    expect(() => placeColumns({ venue: 'Somewhere' })).toThrow(BadRequestException);
    expect(() => placeColumns({ latitude: 6.44 })).toThrow(BadRequestException);
  });

  it('only touches the location on edit when one of its fields is sent', () => {
    expect(changesPlace({})).toBe(false);
    expect(changesPlace({ latitude: null })).toBe(true);
  });
});
