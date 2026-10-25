// Comets: a general kid-friendly explanation plus three real comets with their orbits.
//
// el - orbit elements (ecliptic J2000): a (astronomical units), e, i, node (Ω), argPeri (ω) in degrees,
//      and perihelion: the date the comet was closest to the Sun. Source: JPL Small-Body Database (rounded).

export const COMETS_INFO = {
  id: 'comets',
  name: 'Comets',
  subtitle: 'Dirty snowballs',
  color: '#bfe3ff',
  size: 1,
  facts: [
    ['What are they made of?', 'Ice, dust, and rock'],
    ['Size of the nucleus', 'Usually a few kilometers'],
    ['Length of the tail', 'Can reach hundreds of millions of km'],
    ['Where do they come from?', 'The far edges of the solar system'],
  ],
  funFact: 'When Earth passes through dust left behind by a comet, we see a night shower of "shooting stars"!',
  bridge: 'On our way back in, we’ll meet visitors with glowing tails.',
  narration:
    'Comets are like giant, dirty snowballs: lumps of ice, dust, and rock that come from the far edges of the solar system. ' +
    'Most of the time they are frozen and dark. But when a comet gets close to the Sun, the heat warms it up, and its ice turns into gas. ' +
    'A glowing cloud forms around it, and long tails stretch out behind it. ' +
    'A comet has two tails. One is a bluish tail of gas that always points away from the Sun, and the other is a yellowish tail of dust that curves a little. ' +
    'The tail can be longer than the distance between Earth and the Sun! ' +
    'The orbits of comets are very squashed. They swoop really close to the Sun, and then they travel far, far away from it.',
};

export const COMETS = [
  {
    id: 'halley',
    name: "Halley's Comet",
    short: 'Halley',
    subtitle: 'Returns every 75 years',
    color: '#cfe6ff',
    size: 0.3,
    el: { a: 17.83, e: 0.9671, i: 162.26, node: 58.42, argPeri: 111.33, perihelion: '1986-02-09' },
    facts: [
      ['Orbit time', 'About 75 years'],
      ['Size of the nucleus', 'About 15 by 8 km'],
      ['Last visit', '1986'],
      ['Next visit', '2061'],
    ],
    funFact: "Twice a year Earth passes through the dust of Halley's Comet, and then we can see a meteor shower!",
    narration:
      "This is Halley's Comet, the most famous comet of all. It comes back to our sky about once every seventy-five years, so most people see it only once in their lives. " +
      'The last time it came was in 1986, and the next time it will come is in 2061. Maybe you will see it when you grow up! ' +
      "Halley's Comet goes around the Sun in the opposite direction from the planets. " +
      'Right now it is very far away, even beyond the orbit of Neptune, so it has no tail at all.',
  },
  {
    id: 'encke',
    name: "Encke's Comet",
    short: 'Encke',
    subtitle: 'The fastest of all',
    color: '#d8f0ff',
    size: 0.2,
    el: { a: 2.215, e: 0.8483, i: 11.78, node: 334.57, argPeri: 186.55, perihelion: '2023-10-22' },
    facts: [
      ['Orbit time', '3 years and 3 months'],
      ['Size of the nucleus', 'About 5 km'],
      ['What is special', 'One of the shortest orbits'],
    ],
    funFact: "The dust of Encke's Comet causes a meteor shower every fall, called the Taurids.",
    narration:
      "This is Encke's Comet. It has one of the shortest orbits of any comet. It goes around the Sun in only three years and three months. " +
      'It is small and faint, so it is hard to see without a telescope. ' +
      'When it comes close to the Sun, it gets even closer than the planet Mercury! ' +
      'And the dust it leaves behind causes a meteor shower every fall.',
  },
  {
    id: 'cg67p',
    name: 'Comet Churyumov-Gerasimenko',
    short: '67P',
    subtitle: 'The comet we landed on',
    color: '#e6efff',
    size: 0.2,
    el: { a: 3.463, e: 0.641, i: 7.04, node: 50.14, argPeri: 12.78, perihelion: '2021-11-02' },
    facts: [
      ['Orbit time', 'About 6 and a half years'],
      ['Size of the nucleus', 'About 4 km'],
      ['Spacecraft visit', 'Rosetta, 2014 to 2016'],
    ],
    funFact: 'The shape of this comet looks like a rubber duck!',
    narration:
      'This comet has a long name, Churyumov-Gerasimenko, or just 67P for short. ' +
      'It is famous because in 2014 the spacecraft Rosetta arrived there, flew alongside it for two years, and even landed a little robot on it, called Philae. ' +
      'It was the first time people ever landed anything on a comet! ' +
      'And in the pictures Rosetta took, we could see that its shape looks like a rubber duck.',
  },
];
