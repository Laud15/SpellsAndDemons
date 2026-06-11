import {initializeApp, cert} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import * as path from "path";

const serviceAccountPath = path.resolve(__dirname, "./serviceAccountKey.json");
// enter in functions directory
// Run 'npx ts-node --project tsconfig.json src/seed/seedData.ts'
// to upload data on db
initializeApp({
  credential: cert(serviceAccountPath),
  projectId: "spellsanddemons-be96c",
});
const db = getFirestore();

async function seed() {
  const scrolls = [
    {
      id: "magic_dart",
      name: "Magic dart",
      type: "damage",
      target: "single",
      energyCost: 4,
      damage: 12,
      heal: 0,
      statusEffect: null,
      description: "A little magic spark, the spell that all wizards know",
    },
    {
      id: "fireball",
      name: "Fireball",
      type: "damage",
      target: "multi",
      energyCost: 8,
      damage: 15,
      heal: 0,
      statusEffect: null,
      description: "A blazing ball of fire that scorches all enemies.",
    },
    {
      id: "lightning_bolt",
      name: "Lightning Bolt",
      type: "damage",
      target: "single",
      energyCost: 6,
      damage: 25,
      heal: 0,
      statusEffect: null,
      description: "A precise bolt of lightning that strikes one enemy.",
    },
    {
      id: "heal",
      name: "Heal",
      type: "heal",
      target: "single",
      energyCost: 5,
      damage: 0,
      heal: 30,
      statusEffect: null,
      description: "Restores health to a single ally.",
    },
    {
      id: "mass_heal",
      name: "Mass heal",
      type: "heal",
      target: "multi",
      energyCost: 15,
      damage: 0,
      heal: 20,
      statusEffect: null,
      description: "Restores health to all ally",
    },
    {
      id: "skin_of_stone",
      name: "Skin of Stone",
      type: "buff",
      target: "single",
      energyCost: 4,
      damage: 0,
      heal: 0,
      statusEffect: "stone_skin",
      description: "Hardens the skin, reducing damage taken.",
    },
    {
      id: "haste",
      name: "Haste",
      type: "buff",
      target: "single",
      energyCost: 6,
      damage: 0,
      heal: 0,
      statusEffect: "hasted",
      description: "Greatly increases the target's intuition.",
    },
    {
      id: "slowness",
      name: "Slowness",
      type: "debuff",
      target: "multi",
      energyCost: 5,
      damage: 0,
      heal: 0,
      statusEffect: "slowed",
      description: "Slows all enemies, reducing their intuition.",
    },
    {
      id: "curse",
      name: "Curse",
      type: "debuff",
      target: "single",
      energyCost: 4,
      damage: 0,
      heal: 0,
      statusEffect: "cursed",
      description: "the next time the enemy is hit it takes double damage",
    },
  ];

  const statuses = [
    {
      id: "stone_skin",
      name: "Stone Skin",
      type: "buff",
      effect: "damage_reduction",
      value: 0.5,
      duration: 2,
    },
    {
      id: "slowed",
      name: "Slowed",
      type: "debuff",
      effect: "intuition_reduction",
      value: 0.5,
      duration: 3,
    },
    {
      id: "hasted",
      name: "Hasted",
      type: "buff",
      effect: "intuition_boost",
      value: 2,
      duration: 3,
    },
    {
      id: "cursed",
      name: "Cursed",
      type: "debuff",
      effect: "double_taken_damage",
      value: 2,
      duration: 2,
    },
  ];

  const enemies = [
    {
      id: "ooze",
      name: "Ooze",
      sprite: "ooze",
      baseStats: {
        hp: 35,
        maxHp: 35,
        energy: 15,
        maxEnergy: 15,
        intuition: 0,
      },
      scaling: {
        hp: 10,
        damage: 2,
        regenEnergy: 3,
      },
      moves: ["magic_dart", "slowness"],
      baseDamage: 4,
    },
    {
      id: "infernalOoze",
      name: "Infernal Ooze",
      sprite: "infernalOoze",
      baseStats: {
        hp: 20,
        maxHp: 20,
        energy: 20,
        maxEnergy: 20,
        intuition: 5,
      },
      scaling: {
        hp: 5,
        damage: 3,
        regenEnergy: 2,
      },
      moves: ["fireball", "lightning_bolt"],
      baseDamage: 10,
    },
  ];

  const batch = db.batch();

  for (const scroll of scrolls) {
    batch.set(db.collection("scrolls").doc(scroll.id), scroll);
  }

  for (const status of statuses) {
    batch.set(db.collection("statuses").doc(status.id), status);
  }

  for (const enemy of enemies) {
    batch.set(db.collection("enemies").doc(enemy.id), enemy);
  }

  await batch.commit();
}

seed().catch(console.error);


