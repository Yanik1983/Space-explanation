// Glossary for kids. Every term in the explanations becomes tappable, and Noam explains it.
//
// forms - the ways the term appears in the narration (lowercase). Matching is
//         case-insensitive and whole-word. Each term is linked only once per
//         explanation, the first time it appears.
// text  - the explanation Noam reads aloud.

export const GLOSSARY = [
  {
    id: 'planet',
    title: 'Planet',
    emoji: '🪐',
    forms: ['planets', 'planet'],
    text:
      'A planet is a big, round world that travels around a star, the way Earth travels around the Sun. ' +
      'A planet does not make its own light. We can see it because the Sun shines on it. ' +
      'The word planet comes from an ancient Greek word that means wanderer, because in the sky the planets look like they wander between the stars.',
  },
  {
    id: 'star',
    title: 'Star',
    emoji: '⭐',
    forms: ['stars', 'star'],
    notBefore: [], // not needed in English
    text:
      'A star is a giant ball of burning hot gas that makes its own light and heat. The Sun is a star! ' +
      'All the tiny dots we see in the night sky are stars, just like the Sun. ' +
      'They only look small to us because they are very, very far away.',
  },
  {
    id: 'hot-gas',
    title: 'Hot gas',
    emoji: '🔥',
    forms: ['hot gas', 'gases', 'gas'],
    text:
      'Gas is a kind of stuff with no fixed shape, and it spreads out in every direction, like the air we breathe, or the steam that rises from a boiling pot. ' +
      'Hot means very, very warm. ' +
      'The Sun is made of gas so hot that it glows and shines, like the flame of a candle, only much, much stronger.',
  },
  {
    id: 'solar-system',
    title: 'The Solar System',
    emoji: '☀️',
    forms: ['solar system'],
    text:
      'The solar system is like a big family, with the Sun in the middle. ' +
      'Around the Sun travel eight planets and their moons, plus dwarf planets like Pluto, rocks called asteroids, and comets. ' +
      'They all stay around the Sun because of its gravity.',
  },
  {
    id: 'orbit',
    title: 'Orbit',
    emoji: '🔄',
    forms: ['orbits', 'orbiting', 'orbit'],
    text:
      'An orbit is the path that something takes as it moves through space. ' +
      'Earth moves around the Sun in an orbit that repeats again and again, like a runner running laps around a track. ' +
      'One whole trip around the Sun is called a year.',
  },
  {
    id: 'gravity',
    title: 'Gravity',
    emoji: '🧲',
    forms: ['gravity'],
    text:
      'Gravity is an invisible force that pulls things toward each other. ' +
      'It is why a ball you throw up comes back down, and why we do not float away into the air. ' +
      'The Sun is so big that its gravity holds all the planets close, like an invisible string.',
  },
  {
    id: 'moon',
    title: 'Moon',
    emoji: '🌙',
    forms: ['moons', 'moon'],
    text:
      'A moon is a world that travels around a planet. ' +
      'Earth has one moon, the one we see in the sky at night. Jupiter and Saturn have dozens and dozens of moons, even hundreds! ' +
      'A moon does not make its own light either. It bounces back the light of the Sun, like a mirror.',
  },
  {
    id: 'axis',
    title: 'Axis and spinning',
    emoji: '🌀',
    forms: ['axis', 'spinning', 'spins', 'spin'],
    text:
      'An axis is an imaginary line that goes through the middle of a planet, from the North Pole to the South Pole. ' +
      'The planet spins around this line, like a spinning top turns around its tip. ' +
      'One full spin is one day. When our side faces the Sun it is daytime, and when it turns away it is night.',
  },
  {
    id: 'year',
    title: 'Year',
    emoji: '📅',
    forms: ['years', 'year'],
    text:
      'A year is the time it takes a planet to go around the Sun one time. ' +
      'A year on Earth is 365 days. ' +
      'Every planet has a year of a different length: the farther it is from the Sun, the longer its year.',
  },
  {
    id: 'seasons',
    title: 'Seasons',
    emoji: '🍂',
    forms: ['seasons', 'season'],
    text:
      'The seasons are summer, fall, winter and spring. They happen because Earth is tilted. ' +
      'For part of the year, our half of Earth leans toward the Sun and gets more light and warmth, and that is summer. ' +
      'For another part of the year it leans away from the Sun, and that is winter.',
  },
  {
    id: 'pole',
    title: 'Pole',
    emoji: '🧊',
    forms: ['poles', 'pole'],
    text:
      'A pole is the very top or the very bottom of a planet. They are the two ends of its axis. ' +
      'At the poles of Earth it is freezing cold, and everything is covered in ice and snow. Polar bears and penguins live there.',
  },
  {
    id: 'galaxy',
    title: 'Galaxy and the Milky Way',
    emoji: '🌌',
    forms: ['galaxies', 'galaxy', 'milky way'],
    text:
      'A galaxy is a huge group of billions of stars that travel through space together. ' +
      'Our galaxy is called the Milky Way, and the Sun is just one of its stars. ' +
      'On a very dark night, far from city lights, you can see the Milky Way as a pale, milky stripe across the sky.',
  },
  {
    id: 'atmosphere',
    title: 'Air and atmosphere',
    emoji: '💨',
    forms: ['atmospheres', 'atmosphere', 'air'],
    text:
      'Some planets have a layer of gases wrapped around them, called an atmosphere. On Earth, that is the air we breathe. ' +
      'An atmosphere wraps around a planet like a blanket. It keeps the warmth in, and it protects us from the Sun\'s dangerous rays. ' +
      'Mercury has almost no atmosphere, so at night its heat escapes into space.',
  },
  {
    id: 'clouds',
    title: 'Clouds',
    emoji: '☁️',
    forms: ['clouds', 'cloud'],
    text:
      'Clouds are clumps of tiny drops or tiny grains floating in an atmosphere. ' +
      'On Earth, clouds are made of water, and rain falls from them. ' +
      'On other planets the clouds are made of very different stuff. On Venus, for example, the clouds are made of acid, and on Jupiter there are clouds of ammonia.',
  },
  {
    id: 'degrees',
    title: 'Degrees (hot and cold)',
    emoji: '🌡️',
    forms: ['degrees', 'degree'],
    text:
      'Degrees are how we measure how hot or cold something is. ' +
      'Water freezes into ice at zero degrees, and it boils at one hundred degrees. A hot summer day can be around thirty degrees. ' +
      'When you hear the word minus, it means even colder than ice.',
  },
  {
    id: 'volcano',
    title: 'Volcano',
    emoji: '🌋',
    forms: ['volcanoes', 'volcanos', 'volcano'],
    text:
      'A volcano is a mountain with a deep opening that leads into the belly of a planet. ' +
      'Sometimes melted, glowing rock bursts out of it. It is called lava, and ash and smoke come out too. ' +
      'When lava cools it turns into rock, and that is how the mountain slowly grows. The volcano Olympus Mons on Mars grew this way over millions of years.',
  },
  {
    id: 'rust',
    title: 'Rust',
    emoji: '🔩',
    forms: ['rusty', 'rusted', 'rust'],
    text:
      'Rust is what happens to iron when it meets oxygen and water for a long time. It turns into a reddish-brown powder. ' +
      'The ground on Mars has lots of iron that rusted, and that is why the whole planet looks red.',
  },
  {
    id: 'rover',
    title: 'Robots on Mars',
    emoji: '🤖',
    forms: ['rovers', 'rover'],
    text:
      'The robots that drive around on Mars are called rovers. They are like little cars, with wheels, cameras, an arm, and a tiny laboratory inside. ' +
      'Scientists on Earth send them instructions, and the rovers take pictures, drill into rocks, and check what they are made of.',
  },
  {
    id: 'storm',
    title: 'Storm',
    emoji: '🌪️',
    forms: ['storms', 'storm'],
    text:
      'A storm is very wild weather, with strong winds that swirl around. ' +
      'On Earth a storm lasts a few days. On Jupiter there is a giant storm, the Great Red Spot, that has been raging for hundreds of years!',
  },
  {
    id: 'giants',
    title: 'Gas giants and ice giants',
    emoji: '🎈',
    forms: ['gas giants', 'gas giant', 'ice giants', 'ice giant', 'giant planets'],
    text:
      'A gas giant is a huge planet made mostly of gases, with no solid ground to stand on. Jupiter and Saturn are gas giants. ' +
      'Uranus and Neptune are called ice giants, because inside them there is lots of water and other stuff that is frozen and squeezed tight.',
  },
  {
    id: 'methane',
    title: 'Methane',
    emoji: '🔵',
    forms: ['methane'],
    text:
      'Methane is a gas with no color. On Earth, people use a similar gas for cooking. ' +
      'On Uranus and Neptune, methane soaks up the red light of the Sun and sends back blue light, so these planets look blue.',
  },
  {
    id: 'dwarf-planet',
    title: 'Dwarf planet',
    emoji: '🫘',
    forms: ['dwarf planets', 'dwarf planet'],
    text:
      'A dwarf planet is a round world that goes around the Sun, but it is too small to clear its path of other objects, so it does not count as a regular planet. ' +
      'Pluto and Ceres are dwarf planets.',
  },
  {
    id: 'asteroid',
    title: 'Asteroid',
    emoji: '🪨',
    forms: ['asteroids', 'asteroid'],
    text:
      'An asteroid is a rock that goes around the Sun. Some asteroids are as small as a pebble, and some are as big as a mountain. ' +
      'Most asteroids live in the asteroid belt, between Mars and Jupiter.',
  },
  {
    id: 'spacecraft',
    title: 'Spacecraft',
    emoji: '🛰️',
    forms: ['spacecraft', 'space probes', 'space probe', 'probes', 'probe'],
    text:
      'A spacecraft is a vehicle that people build and send into space. Most spacecraft have no people on board at all. ' +
      'They are like flying robots, with cameras and instruments, that send us pictures and information from faraway planets.',
  },
  {
    id: 'comet',
    title: 'Comet',
    emoji: '☄️',
    forms: ['comets', 'comet'],
    text:
      'A comet is a lump of ice, dust and rock, like a dirty snowball, that goes around the Sun on a very stretched-out path. ' +
      'When it gets close to the Sun, its ice warms up and turns into gas, and the comet grows a glowing cloud and a long tail.',
  },
  {
    id: 'meteor',
    title: 'Meteor (shooting star)',
    emoji: '🌠',
    forms: ['meteor showers', 'meteor shower', 'meteors', 'meteor', 'shooting stars', 'shooting star', 'falling stars', 'falling star'],
    text:
      'A meteor is a tiny grain of dust or rock from space that zooms into Earth\'s air super fast and burns up. ' +
      'From the ground it looks like a short streak of light in the sky, so people also call it a shooting star, even though it is not a star at all. ' +
      'A meteor shower is a night when you can see lots of meteors like that.',
  },
  {
    id: 'ellipse',
    title: 'Ellipse',
    emoji: '🥚',
    forms: ['ellipses', 'ellipse', 'elliptical'],
    text:
      'An ellipse is a shape like a circle that has been squashed a little, a bit like an egg lying on its side. ' +
      'The orbits of the planets are ellipses, so sometimes a planet is closer to the Sun, and sometimes it is farther away.',
  },
  {
    id: 'black-hole',
    title: 'Black hole',
    emoji: '🕳️',
    forms: ['black holes', 'black hole'],
    text:
      'A black hole is a place in space where gravity is so strong that nothing can escape from it, not even light. ' +
      'Black holes form when a giant star runs out of fuel and collapses in on itself. ' +
      'They do not gobble up everything in space, like many people think. ' +
      'If a black hole with the same weight as our Sun took its place, Earth would keep going around it just like now. ' +
      'Only something that gets very, very close can never come back.',
  },
  {
    id: 'light-year',
    title: 'Light-year',
    emoji: '💡',
    forms: ['light-years', 'light-year', 'light years', 'light year'],
    text:
      'Light is the fastest thing there is. It travels almost three hundred thousand kilometers every second! ' +
      'A light-year is the distance light travels in one whole year, which is about nine and a half trillion kilometers. ' +
      'We use it to measure distances between stars, because they are so far away that the numbers in kilometers would be way too long. ' +
      'When we say a star is ten light-years away, it means its light travels for ten years before it reaches us.',
  },
  {
    id: 'mass',
    title: 'Mass',
    emoji: '⚖️',
    forms: ['mass'],
    text:
      'Mass is the amount of stuff that is inside an object. ' +
      'The more stuff an object has, the bigger its mass, and the stronger its gravity. ' +
      'When we say a black hole is ten times heavier than the Sun, it means its mass is ten times the mass of the Sun.',
  },
  {
    id: 'accretion-disc',
    title: 'Ring of hot gas',
    emoji: '🍩',
    forms: ['ring of hot gas', 'ring of glowing gas', 'ring of gas', 'accretion discs', 'accretion disc', 'accretion disks', 'accretion disk'],
    text:
      'When gas falls toward a black hole, it does not fall straight in. It swirls around it at a crazy speed, like water swirling around the drain in a bathtub. ' +
      'With all that speed and rubbing, the gas heats up until it is burning hot and glowing, and that makes a shining ring. ' +
      'The black hole itself stays black, but the ring around it glows.',
  },
  {
    id: 'light-bending',
    title: 'Bending light',
    emoji: '🔭',
    forms: ['bends the light', 'bends light', 'bend the light', 'bend light', 'bending light', 'bent light', 'bending of light'],
    text:
      'Strong gravity does not only pull on things, it also bends the path of light. ' +
      'Light that passes near a black hole curves around it, like a car going around a bend. ' +
      'That is why, when you look at a black hole, the stars behind it look stretched and flipped, and you can even see the same ring both above and below it.',
  },
  {
    id: 'andromeda',
    title: 'The Andromeda Galaxy',
    emoji: '🌌',
    forms: ['andromeda galaxy', 'andromeda'],
    text:
      'Andromeda is the biggest galaxy that is close to the Milky Way. It is about two and a half million light-years away from us. ' +
      'It has about a trillion stars, more than our own Milky Way. ' +
      'On a very dark night, far from city lights, you can see it with your own eyes, as a small, fuzzy patch of light in the sky. ' +
      'It is one of the farthest things you can see without a telescope!',
  },
];

// The question Noam asks when we go back from a term to the main explanation
export const CONTINUE_QUESTION = 'Want me to keep explaining?';

// Search order: longer forms first, so "dwarf planet" is matched before "planet"
export const GLOSSARY_FORMS = GLOSSARY.flatMap((g) => g.forms.map((form) => ({ form, term: g })))
  .sort((a, b) => b.form.length - a.form.length);
