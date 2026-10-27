import { DataSource } from 'typeorm';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { MessagesService } from './messages.service';

describe('MessagesService', () => {
  const query = jest.fn();
  const service = new MessagesService({ query } as unknown as DataSource, {} as CloudinaryService);
  beforeEach(() => query.mockReset());

  it('allows a direct message from a runner profile', async () => {
    query.mockResolvedValueOnce([{ userId: 'other', username: 'other' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'message' }]);
    await service.send('me', 'other', 'Hello');
    expect(query.mock.calls[3][1]).toEqual(['me', 'other', 'Hello', null, null, null, null]);
  });

  it('sends trimmed text and checks that a reply belongs to this conversation', async () => {
    query.mockResolvedValueOnce([{ userId: 'other', username: 'other' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ id: 'message' }]);
    await service.send('me', 'other', '  Good run  ', { replyToId: 'reply-id' });
    expect(query.mock.calls[4][1]).toEqual(['me', 'other', 'Good run', 'reply-id', null, null, null]);
  });

  it('rejects replying to a message in another conversation', async () => {
    query.mockResolvedValueOnce([{ userId: 'other', username: 'other' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(service.send('me', 'other', 'Hello', { replyToId: 'someone-elses-message' })).rejects.toThrow('this conversation');
  });

  it('refuses a message between runners where either has blocked the other', async () => {
    query.mockResolvedValueOnce([{ userId: 'other', username: 'other' }]).mockResolvedValueOnce([{ '?column?': 1 }]);
    await expect(service.send('me', 'other', 'Hello')).rejects.toThrow('can’t message this runner');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('refuses a message to a runner who only takes messages from people they follow', async () => {
    query.mockResolvedValueOnce([{ userId: 'other', username: 'other' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ '?column?': 1 }]);
    await expect(service.send('me', 'other', 'Hello')).rejects.toThrow('only gets messages from runners they follow');
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('does not allow a stranger to react to a message', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.react('stranger', 'message', 'HEART')).rejects.toThrow('Message not found');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('updates a reaction from a conversation participant', async () => {
    query.mockResolvedValueOnce([{}]).mockResolvedValueOnce([]);
    await service.react('me', 'message', 'FIRE');
    expect(query.mock.calls[1][1]).toEqual(['message', 'me', 'FIRE']);
  });

  it('sends trimmed text without a reply', async () => {
    query.mockResolvedValueOnce([{ userId: 'other', username: 'other' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'message' }]);
    await service.send('me', 'other', '  Good run  ');
    expect(query.mock.calls[3][1]).toEqual(['me', 'other', 'Good run', null, null, null, null]);
  });

  it('edits only the sender’s regular message', async () => {
    query.mockResolvedValueOnce([{ id: 'message', body: 'Updated', editedAt: 'now' }]);
    await expect(service.edit('me', 'message', '  Updated  ')).resolves.toMatchObject({ body: 'Updated' });
    expect(query.mock.calls[0][0]).toContain('"senderId"=$2 AND "invitationId" IS NULL');
    expect(query.mock.calls[0][1]).toEqual(['message', 'me', 'Updated']);
  });

  it('rejects edits to messages not owned by the sender', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.edit('stranger', 'message', 'Changed')).rejects.toThrow('cannot be edited');
  });

  it('rejects blank edits', async () => {
    await expect(service.edit('me', 'message', '   ')).rejects.toThrow('Write a message');
    expect(query).not.toHaveBeenCalled();
  });

  it('counts only unread messages addressed to the runner', async () => {
    query.mockResolvedValueOnce([{ count: 3 }]);
    await expect(service.unreadCount('me')).resolves.toEqual({ count: 3 });
    expect(query.mock.calls[0][1]).toEqual(['me']);
    expect(query.mock.calls[0][0]).toContain('"readAt" IS NULL');
  });

  it('marks only messages from the opened runner as read', async () => {
    query.mockResolvedValueOnce([{ userId: 'other', username: 'other' }]).mockResolvedValueOnce([]);
    await expect(service.markRead('me', 'other')).resolves.toEqual({ read: true });
    expect(query.mock.calls[1][1]).toEqual(['other', 'me']);
    expect(query.mock.calls[1][0]).toContain('"readAt" IS NULL');
  });
});
