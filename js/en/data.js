// Data for the Sun and the planets: numbers for the simulation + English texts for narration.
//
// rotation - time to spin once around its axis, in Earth days (negative = spins backwards)
// pole     - direction of the north pole [right ascension, declination] in degrees (IAU), which gives the axis tilt
// size     - size *on screen* (greatly enlarged, explained in the tour)
// The orbits and positions themselves are calculated in orbits.js

export const SUN = {
  id: 'sun',
  name: 'The Sun',
  subtitle: 'Our star',
  color: '#ffb52e',
  size: 7,
  rotation: 25.4,
  pole: [286.13, 63.87],
  facts: [
    ['What is it?', 'A star – a giant ball of hot gas'],
    ['Diameter', 'About 1,390,000 km (109 times Earth)'],
    ['Surface temperature', 'About 5,500 degrees Celsius'],
    ['Spin', 'About 25 days at the equator'],
    ['Its light reaches us in', '8 minutes and 20 seconds'],
  ],
  funFact: 'You could fit about 1,300,000 Earths inside the Sun!',
  narration:
    'This is the Sun! The Sun is a star, just like the stars we see at night, only much closer to us. ' +
    'It is a giant ball of hot gas that lights up and warms the whole solar system. ' +
    'The Sun is so big that more than a million Earths could fit inside it. ' +
    'The Sun moves too! It spins around itself, once every twenty-five days or so. ' +
    'And since it is made of gas, its middle spins faster than the top and the bottom. ' +
    'Here is another surprise: the Sun, along with all the planets, also zooms around the center of our galaxy, the Milky Way. ' +
    'One trip around takes about 230 million years!',
};

export const PLANETS = [
  {
    id: 'mercury',
    name: 'Mercury',
    subtitle: 'The smallest and fastest',
    color: '#a9a39b',
    size: 0.8,
    rotation: 58.65,
    pole: [281.01, 61.42],
    facts: [
      ['Place from the Sun', 'First – the closest'],
      ['Year (trip around the Sun)', '88 days'],
      ['Diameter', 'About 4,900 km'],
      ['Temperature', '430 degrees by day, minus 180 at night'],
      ['Moons', 'None'],
    ],
    funFact: 'One day on Mercury (from sunrise to sunrise) is longer than a whole year there!',
    narration:
      'This is Mercury, the planet closest to the Sun, and also the smallest. ' +
      'It is the fastest of them all: it circles the Sun in just eighty-eight days. ' +
      'Its orbit is the most squished of all the planets, so sometimes it is closer to the Sun and sometimes farther away. ' +
      'That means if you lived there, you would have a birthday almost four times a year! ' +
      'But it spins around itself very slowly, so one day there is very long. ' +
      'It has no air to hold in the heat, so by day it is hotter than an oven, and at night it is colder than any freezer.',
  },
  {
    id: 'venus',
    name: 'Venus',
    subtitle: 'The hottest',
    color: '#e8c27a',
    size: 1.3,
    rotation: -243.0,
    pole: [272.76, 67.16],
    facts: [
      ['Place from the Sun', 'Second'],
      ['Year', '225 days'],
      ['Spin', '243 days – and backwards!'],
      ['Temperature', 'About 465 degrees'],
      ['Moons', 'None'],
    ],
    funFact: 'On Venus the Sun rises in the west and sets in the east, because it spins backwards!',
    narration:
      'This is Venus. It is almost the same size as Earth, but it is the hottest planet in the solar system. ' +
      'It is wrapped in thick clouds that trap the heat, like a very thick blanket, so it is even hotter there than on Mercury. ' +
      'Venus has another oddity: it spins in the opposite direction from most planets, and very slowly. ' +
      'One spin takes longer than a whole trip around the Sun! ' +
      'After the Moon, Venus is the brightest thing in the night sky, and sometimes it is called the morning star or the evening star.',
  },
  {
    id: 'earth',
    name: 'Earth',
    subtitle: 'Our home',
    color: '#3f8fe0',
    size: 1.4,
    rotation: 0.9973,
    pole: [0, 90],
    moon: { name: 'The Moon', size: 0.36, distance: 2.5 },
    facts: [
      ['Place from the Sun', 'Third'],
      ['Year', '365 and a quarter days'],
      ['Day', '24 hours'],
      ['Diameter', 'About 12,700 km'],
      ['Moons', 'One – the Moon'],
    ],
    funFact: 'Right now, we are zooming around the Sun with Earth at about 30 kilometers per second!',
    narration:
      'And this is Earth, our home! It is the only planet we know of that has life on it. ' +
      'Most of its surface is covered in water, so from space it looks blue. ' +
      'Earth spins around itself once a day, and that is how we get day and night. ' +
      'It goes around the Sun once a year. ' +
      'Notice that its axis is a little bit tilted, and that is why we have seasons: summer, fall, winter and spring. ' +
      'And around Earth goes the Moon, about once a month.',
  },
  {
    id: 'mars',
    name: 'Mars',
    subtitle: 'The red planet',
    color: '#c1440e',
    size: 1.0,
    rotation: 1.026,
    pole: [317.68, 52.89],
    facts: [
      ['Place from the Sun', 'Fourth'],
      ['Year', '687 days'],
      ['Day', '24 hours and 37 minutes'],
      ['Tallest mountain', 'Olympus Mons – about 22 km'],
      ['Moons', 'Two – Phobos and Deimos'],
    ],
    funFact: 'Mars has the tallest mountain in the solar system – two and a half times taller than Everest!',
    narration:
      'This is Mars, the red planet. It is red because its soil is full of rust, like an old nail. ' +
      'A day on Mars is almost exactly as long as ours, but a year there is almost twice as long. ' +
      'Mars has the tallest mountain in the solar system, a huge volcano called Olympus Mons. ' +
      'It has two small moons, Phobos and Deimos. ' +
      'Right now, robots sent from Earth are rolling around on Mars, looking for signs that water once flowed there.',
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    subtitle: 'The giant',
    color: '#d8a878',
    size: 3.6,
    rotation: 0.4135,
    pole: [268.06, 64.5],
    facts: [
      ['Place from the Sun', 'Fifth'],
      ['Year', 'Almost 12 years'],
      ['Day', 'Less than 10 hours – the shortest!'],
      ['Diameter', '11 times Earth'],
      ['Moons', 'More than 90'],
    ],
    funFact: 'Jupiter’s Great Red Spot is a giant storm that is bigger than the whole Earth!',
    narration:
      'This is Jupiter, the biggest planet in the solar system. It is so big that all the other planets together would fit inside it. ' +
      'Jupiter has no ground to stand on, because it is made mostly of gases. ' +
      'Do you see the stripes? Those are clouds blown around it by strong winds. ' +
      'And the Great Red Spot is a giant storm, bigger than the whole Earth, that has been raging for hundreds of years. ' +
      'Even though it is so big, Jupiter spins faster than any other planet: a day there lasts less than ten hours. ' +
      'Jupiter has more than ninety moons!',
  },
  {
    id: 'saturn',
    name: 'Saturn',
    subtitle: 'The ringed one',
    color: '#e3cf98',
    size: 3.0,
    rotation: 0.444,
    pole: [40.59, 83.54],
    rings: true,
    facts: [
      ['Place from the Sun', 'Sixth'],
      ['Year', 'About 29 and a half years'],
      ['Day', 'About 10 hours and 40 minutes'],
      ['Rings', 'Billions of pieces of ice and rock'],
      ['Moons', 'More than 270 – the most!'],
    ],
    funFact: 'Saturn is so light for its size that if you had a bathtub big enough, it would float!',
    narration:
      'This is Saturn, the planet with the famous rings. ' +
      'The rings are made of billions of pieces of ice and rock. Some are small as a grain of sand, and some are big as a house. ' +
      'All of them circle around Saturn. ' +
      'Saturn is a gas giant, like Jupiter, and it is very light for its size. ' +
      'To go around the Sun once, it needs almost thirty years. ' +
      'And Saturn has the most moons in the solar system: more than two hundred and seventy!',
  },
  {
    id: 'uranus',
    name: 'Uranus',
    subtitle: 'Lying on its side',
    color: '#9fdfe6',
    size: 2.0,
    rotation: -0.718,
    pole: [257.31, -15.18],
    facts: [
      ['Place from the Sun', 'Seventh'],
      ['Year', '84 years'],
      ['Day', 'About 17 hours'],
      ['Axis tilt', 'Almost 98 degrees – lying on its side'],
      ['Moons', 'More than 25'],
    ],
    funFact: 'At the poles of Uranus there are 42 years of light followed by 42 years of darkness!',
    narration:
      'This is Uranus, a light blue ice giant. Its color comes from a gas called methane. ' +
      'Uranus is very special: it is lying on its side! ' +
      'It looks like something big crashed into it a very long time ago and knocked it over. ' +
      'So it rolls around the Sun like a ball rolling on the floor. ' +
      'One year on Uranus lasts eighty-four years, and at each pole there are forty-two years of light, followed by forty-two years of darkness.',
  },
  {
    id: 'neptune',
    name: 'Neptune',
    subtitle: 'Far away and stormy',
    color: '#3f5fd6',
    size: 2.0,
    rotation: 0.671,
    pole: [299.36, 43.46],
    facts: [
      ['Place from the Sun', 'Eighth – the farthest'],
      ['Year', 'About 165 years'],
      ['Day', 'About 16 hours'],
      ['Winds', 'Up to 2,000 km/h – the strongest'],
      ['Moons', 'More than 14, the biggest is Triton'],
    ],
    funFact: 'Neptune was discovered in 1846, and since then it has gone around the Sun only once!',
    narration:
      'And this is Neptune, the planet farthest from the Sun. It is dark blue, very cold and very dark. ' +
      'Neptune has the strongest winds in the solar system, faster than a jet plane. ' +
      'Because it is so far away, its path around the Sun is very long, and it also moves slowly. ' +
      'One trip around takes about a hundred and sixty-five years! ' +
      'Its big moon, Triton, goes around it in the opposite direction, which is very rare.',
  },
  {
    id: 'pluto',
    name: 'Pluto',
    subtitle: 'A dwarf planet',
    dwarf: true,
    color: '#cdb79e',
    size: 0.55,
    rotation: -6.387,
    pole: [132.99, -6.16],
    facts: [
      ['Type', 'Dwarf planet'],
      ['Year', 'About 248 years'],
      ['Day', 'About 6 and a half days'],
      ['Diameter', 'About 2,380 km – smaller than our Moon'],
      ['Moons', 'Five, the biggest is Charon'],
    ],
    funFact: 'Pluto has a huge bright heart-shaped area, discovered by the New Horizons spacecraft!',
    narration:
      'And this is Pluto! It used to be called the ninth planet, but in two thousand and six scientists decided to call it a dwarf planet. ' +
      'It is very small, even smaller than our Moon, and in its neighborhood there are lots of other icy worlds like it. ' +
      'Pluto is so far away that one trip around the Sun takes it two hundred and forty-eight years. ' +
      'Its orbit is squished and very tilted, and sometimes it is even closer to the Sun than Neptune. ' +
      'In two thousand and fifteen, a spacecraft called New Horizons flew by it, and found mountains of ice and a bright area shaped like a giant heart.',
  },
];

// The opening of the tour, in three short stops. Each sentence triggers an effect on screen (see INTRO_CUES in main.js).
// Important: the sentences match the recordings in audio/, so if you change a sentence it must be re-recorded.
export const TOUR_INTRO = [
  {
    id: 'welcome',
    title: 'Welcome to the solar system!',
    narration:
      'Hi! I’m Ofek, and I’ll be your guide. Welcome to the solar system! In the center is the Sun, and eight planets circle around it. ' +
      'They all move around the Sun in the same direction, like race cars on a track, and almost on the same flat level, as if they were on a giant table. ' +
      'What keeps them on their path is the Sun’s gravity.',
  },
  {
    id: 'motion',
    title: 'How do the planets move?',
    narration:
      'The farther a planet is from the Sun, the slower it moves, and the longer its path is, so its year is longer too. ' +
      'The orbits are not perfect circles, but ellipses, like a circle that got a little squished. When a planet gets closer to the Sun it speeds up, and when it moves away it slows down. ' +
      'And all the planets are shown right where they are in the sky today! ' +
      'On top of that, every planet also spins around itself, like a spinning top.',
  },
  {
    id: 'secret',
    title: 'A little secret about distances',
    narration:
      'Here’s a little secret: in real life the distances are much, much bigger. If we drew everything at its real size, the planets would be smaller than a dot and we couldn’t see them. ' +
      'So here we made them bigger and moved them closer, so we can get to know all of them. With the real distances button you can see how far away they really are. Let’s go!',
  },
];

export const TOUR_OUTRO = {
  title: 'The tour is over!',
  narration:
    'That’s the end of our tour of the solar system! Now it’s your turn to explore. ' +
    'You can click on any planet to hear about it again, speed up time to see how everything moves, ' +
    'and turn the view with your finger or the mouse. Have a great journey, see you!',
};

export const SCALE_REAL = {
  title: 'The real distances',
  narration:
    'Now the distances between the planets are just like in real life! ' +
    'Do you see how close together the small planets are near the Sun, and how far apart the giants are? Neptune is thirty times farther from the Sun than Earth. ' +
    'We still made the planets themselves much bigger, otherwise we wouldn’t see them at all. ' +
    'If the Sun were the size of a soccer ball, Earth would be the size of a peppercorn, about twenty-four meters away from it. ' +
    'And Neptune? It would be more than seven hundred meters away!',
};

export const SCALE_COMPRESSED = {
  title: 'Shrunken distances',
  narration:
    'We’re back to the shrunken view. We moved the faraway planets closer, so it’s easy to see all of them together. ' +
    'The directions and orbits are still like in real life, only the distances are smaller.',
};

export const ASTEROID_BELT = {
  id: 'belt',
  name: 'The asteroid belt',
  subtitle: 'Between Mars and Jupiter',
  color: '#9b8d7e',
  size: 5,
  facts: [
    ['Where?', 'Between Mars and Jupiter'],
    ['Distance from the Sun', 'About 330 to 500 million km'],
    ['How many asteroids?', 'Millions – more than a million are bigger than a kilometer'],
    ['The biggest', 'Ceres, a dwarf planet 940 km across'],
  ],
  funFact: 'If we put all the asteroids in the belt together, we would get an object much smaller than our Moon!',
  narration:
    'Between Mars and Jupiter is the asteroid belt. ' +
    'Asteroids are rocks that go around the Sun. Some are small as a pebble, and some are big as a mountain, or even as a city. ' +
    'There are millions of asteroids there, but they are very far apart, so spacecraft fly through the belt without bumping into anything. ' +
    'The asteroids are leftovers from the time when the solar system was born: material that never managed to join into one planet, probably because of Jupiter’s strong gravity. ' +
    'The biggest object in the belt is Ceres, which is a dwarf planet, like Pluto.',
};

// The solar system on the move: the Sun and all the planets zoom together around the center of the galaxy
export const GALAXY_MOTION = {
  id: 'galaxy-motion',
  name: 'The solar system zooms through space',
  subtitle: 'A journey around the center of the galaxy',
  color: '#9db8ff',
  size: 1,
  facts: [
    ['Speed', 'About 230 km per second – more than 800,000 km/h'],
    ['One trip around the galaxy', 'About 230 million years'],
    ['Distance from the galaxy’s center', 'About 26,000 light-years'],
    ['How many trips so far?', 'About 20, since the solar system was born'],
  ],
  funFact: 'While you read this sentence, the solar system has already zoomed more than a thousand kilometers!',
  narration:
    'Here’s a surprising secret: the solar system is not standing still! The Sun is zooming through space, and all the planets zoom along with it. ' +
    'Do you see the glowing tail behind the Sun? It shows the path it travels as it flies forward. ' +
    'It moves around the center of our galaxy, the Milky Way, at about two hundred and thirty kilometers every second! ' +
    'One whole trip around the center of the galaxy takes about two hundred and thirty million years. ' +
    'Because the planets circle the Sun while it flies forward, their path through space is not a circle, but a spiral, like a stretched spring. ' +
    'Do you see the trails the planets leave behind? That means Earth never comes back to exactly the same place in space. ' +
    'In this picture we slowed the Sun’s motion way down, otherwise the trails would be too long to see.',
};

// The closest black hole we know of (Gaia BH1), drawn like Gargantua from the movie "Interstellar" (a stop after "zooming through space")
export const BLACK_HOLE = {
  id: 'black-hole',
  name: 'Black hole',
  subtitle: 'Gaia BH1 – the black hole closest to us',
  color: '#ffb066',
  size: 1,
  facts: [
    ['Distance', 'About 1,560 light-years'],
    ['Mass', 'Almost 10 times the Sun'],
    ['Size', 'A ball only about 56 kilometers wide'],
    ['Where in the sky', 'Toward the constellation Ophiuchus'],
    ['When it was found', 'In 2022, with the Gaia space telescope'],
  ],
  funFact: 'Near a black hole, time passes more slowly! In the movie “Interstellar”, one hour on a planet near the black hole equals seven years on Earth.',
  narration:
    'Now we’ll fly to one of the most mysterious things in the universe: a black hole! ' +
    'A black hole is a place where gravity is so strong that nothing can escape from it, not even light. That’s why it is completely black. ' +
    'The closest black hole we know of is called Gaia B H one. ' +
    'It is about one thousand five hundred and sixty light-years away, and it is ten times heavier than the Sun, but all that mass is squeezed into a ball only fifty-six kilometers wide. ' +
    'We drew it here like the black hole in the movie “Interstellar”: a ring of hot gas spins around it, and its gravity bends the light of that ring, so we can see it both above and below the hole. ' +
    'The real black hole has no glowing ring like this, so you can’t see it at all. ' +
    'Scientists found it because they saw a star like our Sun wobbling, and they figured out that something heavy and invisible was pulling on it. ' +
    'And don’t worry: it is very far away, and it can’t hurt us.',
};

// The Milky Way from outside: the camera flies out of the galaxy (a stop after "zooming through space")
export const MILKY_WAY = {
  id: 'milky-way',
  name: 'The Milky Way',
  subtitle: 'Our galaxy, from the outside',
  color: '#e8d9b0',
  size: 1,
  facts: [
    ['Size', 'About 100,000 light-years across'],
    ['How many stars', 'Between 100 and 400 billion'],
    ['Age', 'About 13.6 billion years'],
    ['At the center', 'A giant black hole called Sagittarius A*'],
    ['The big neighbor', 'The Andromeda galaxy, 2.5 million light-years from us'],
  ],
  funFact: 'The Andromeda galaxy is coming toward us, and in about four and a half billion years the two galaxies will crash and merge into one big galaxy!',
  narration:
    'Now we’ll fly very far away, out of our galaxy, and look at it from the outside. ' +
    'This is the Milky Way: a giant swirl of hundreds of billions of stars, with arms that curl around the center. ' +
    'Our Sun is just one star among them. We are right here, on one of the arms, about halfway between the center and the edge. ' +
    'The Milky Way is so big that even light, the fastest thing there is, needs a hundred thousand years to cross it from one end to the other. ' +
    'At the center of the galaxy hides a giant black hole, four million times heavier than the Sun. ' +
    'And one more secret: nobody has ever taken a picture of our galaxy from the outside, because no spacecraft has gone so far. ' +
    'The scientists drew this picture based on what they see from the inside.',
};
