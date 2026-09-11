import { protectionPressure } from './discovery-pressure-fixture.mjs';
import { advanceSurvivalRun } from '../app/simulation/survival/engine.ts';
import { discoveryInput } from '../app/simulation/survival/discovery-boundary.ts';
import { prepareDiscovery } from '../app/simulation/survival/discovery-policy.ts';
import { rememberedConditions, planNeedsRepair } from '../app/simulation/survival/survival-forecast.ts';

let world = protectionPressure('discovery-dev-cold-2');
for (let tick = 1; tick <= 174; tick++) {
  world = advanceSurvivalRun(world, 1).state;
  if (![144, 145, 146, 151, 152, 163, 168, 169, 170].includes(tick)) continue;
  const a = world.agents[0], privateInput = discoveryInput(a, tick, world.environment.bounds);
  console.log(JSON.stringify({ tick, needs: a.needs, position: a.position,
    plan: a.currentPlan, navigation: a.navigation, conditions: rememberedConditions(privateInput.agent, tick),
    repair: planNeedsRepair(privateInput.agent, tick, world.environment.bounds),
    choices: prepareDiscovery(privateInput).slice(0, 2),
    uses: a.physicalMind.uses?.slice(-3), readings: a.physicalMind.readings.slice(-2) }));
}
