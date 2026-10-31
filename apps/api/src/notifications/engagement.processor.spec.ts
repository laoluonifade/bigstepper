import { EngagementProcessor } from './engagement.processor';
import { DEFAULT_SETTINGS } from './engagement-policy';
describe('EngagementProcessor rollout', () => {
  it('does not generate any new engagement by default', async () => {
    const query = jest.fn();
    const p = new EngagementProcessor(
      { query } as never,
      { settings: async () => DEFAULT_SETTINGS } as never,
      {} as never,
    );
    await p.process({ name: 'engagement-evaluation' } as never);
    expect(query).not.toHaveBeenCalled();
  });
  it('only executes explicitly enabled trigger rules', async () => {
    const query = jest.fn();
    const p = new EngagementProcessor(
      { query } as never,
      {
        settings: async () => ({
          ...DEFAULT_SETTINGS,
          newTriggersEnabled: true,
          rolloutPercent: 100,
          triggers: { weeklyGoal: true },
        }),
      } as never,
      {} as never,
    );
    await p.process({ name: 'engagement-evaluation' } as never);
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toContain("'VERIFIED'");
    expect(String(query.mock.calls[0][0])).toContain('ON CONFLICT');
  });
});
