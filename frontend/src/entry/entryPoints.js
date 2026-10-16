// The three ways to start (spec section 6). All of them land in the same editor and data model.
export const ENTRY_POINTS = Object.freeze([
  Object.freeze({
    id: 'guided',
    icon: 'chat',
    title: 'Guide me',
    description: 'Answer a few questions and the AI designer will propose a wardrobe for you to confirm.',
    action: 'Start guided flow',
    composerHint: 'Tell me about the space: how wide and tall should the wardrobe be?',
  }),
  Object.freeze({
    id: 'freeText',
    icon: 'edit',
    title: 'Describe it',
    description: 'Type your wardrobe in your own words. The AI designer turns it into a proposal you approve.',
    action: 'Enter description',
    composerHint: 'e.g. 240 cm wide, 260 cm tall, white, three compartments',
  }),
  Object.freeze({
    id: 'basic',
    icon: 'wardrobe',
    title: 'Start from a basic wardrobe',
    description: 'Begin with a standard 200 × 240 × 60 cm wardrobe, then edit it by hand or with the AI.',
    action: 'Open basic wardrobe',
    composerHint: '',
  }),
]);

export const getEntryPoint = (id) => ENTRY_POINTS.find((entry) => entry.id === id) ?? null;
