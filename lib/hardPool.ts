// Hard mode uses everyday things everyone recognises (Toothbrush, Hedgehog,
// Pancake…), paired so that no short route exists between them. Everyone
// knows both pages; finding the path is the hard part.
//
// Vetted against Wikipedia on 2026-10-23:
// - Targets: between 40 and 2,000 articles link to them (counting redirects),
//   few enough to fetch them all and prove there's no 2-click route, and
//   enough that the page can be found.
// - Starts: at most 2,000 outgoing article links, so all of them can be
//   checked too, and at least 60 so the player has somewhere to go.
// Famous hubs (Hedgehog, Lighthouse…) have too many incoming links to be
// targets, but make fine starts.

export const HARD_TARGETS = [
  "Toothbrush", "Toothpaste", "Umbrella", "Paper clip", "Stapler", "Pencil", "Eraser", "Spoon", "Fork",
  "Chopsticks", "Teapot", "Kettle", "Refrigerator", "Microwave oven", "Washing machine", "Vacuum cleaner",
  "Doorbell", "Candle", "Pillow", "Blanket", "Couch", "Bunk bed", "Alarm clock", "Sunglasses", "Backpack",
  "Wallet", "Padlock", "Zipper", "Button", "Shoelaces", "Sock", "Flip-flops", "Raincoat", "Hoodie",
  "Bubble wrap", "Duct tape", "Post-it note", "Paper plane", "Origami", "Kite", "Yo-yo", "Rubik's Cube",
  "Jigsaw puzzle", "Teddy bear", "Rubber duck", "Frisbee", "Skateboard", "Roller skates", "Trampoline",
  "Hammock", "Seesaw", "Waffle", "Popcorn", "Doughnut", "Croissant", "Bagel", "Peanut butter", "Marshmallow",
  "Lollipop", "Cotton candy", "Ice cream cone", "Milkshake", "Lemonade", "Omelette", "Porridge", "Pretzel",
  "Nachos", "Burrito", "Dumpling", "Instant noodles", "Spaghetti", "Lasagna", "Cheesecake",
  "Chocolate brownie", "Cupcake", "Avocado", "Watermelon", "Broccoli", "Potato chips", "Platypus", "Sloth",
  "Koala", "Seahorse", "Goldfish", "Hamster", "Guinea pig", "Bumblebee", "Chameleon", "Axolotl", "Snowman",
  "Barber", "Hide-and-seek", "Hopscotch", "Snowball fight", "Picnic", "Hula hoop", "Soap bubble", "Hiccup",
  "Yawn", "Sneeze", "Tickling", "Nap", "Snoring", "Sleepwalking", "Goose bumps", "Dimple", "Freckle",
  "Bubble gum", "Chewing gum", "Toaster", "Corkscrew", "Vacuum flask", "Lunchbox", "Piggy bank", "Snow globe",
  "Wind chime", "Scarecrow", "Piñata", "Balloon", "Confetti", "Sparkler", "Birthday cake", "Tooth fairy",
  "Hot air balloon", "Paper towel", "Tissue paper",
];

export const HARD_STARTS = [
  "Toothbrush", "Toothpaste", "Umbrella", "Paper clip", "Pencil", "Scissors", "Spoon", "Fork", "Chopsticks",
  "Teapot", "Kettle", "Refrigerator", "Microwave oven", "Washing machine", "Vacuum cleaner", "Doorbell",
  "Candle", "Mirror", "Pillow", "Blanket", "Couch", "Bunk bed", "Alarm clock", "Watch", "Sunglasses",
  "Backpack", "Wallet", "Padlock", "Zipper", "Button", "Shoelaces", "Sock", "Flip-flops", "Raincoat", "Hoodie",
  "Bubble wrap", "Duct tape", "Rubber band", "Post-it note", "Paper plane", "Origami", "Kite", "Yo-yo",
  "Rubik's Cube", "Jigsaw puzzle", "Teddy bear", "Rubber duck", "Frisbee", "Skateboard", "Roller skates",
  "Trampoline", "Hammock", "Pancake", "Waffle", "Popcorn", "Doughnut", "Croissant", "Bagel", "French fries",
  "Ketchup", "Mayonnaise", "Peanut butter", "Marshmallow", "Lollipop", "Ice cream cone", "Milkshake",
  "Lemonade", "Hot dog", "Sandwich", "Omelette", "Porridge", "Pretzel", "Nachos", "Burrito", "Dumpling",
  "Instant noodles", "Spaghetti", "Lasagna", "Cheesecake", "Chocolate brownie", "Cupcake", "Gingerbread",
  "Pickled cucumber", "Avocado", "Watermelon", "Coconut", "Pineapple", "Strawberry", "Mango", "Garlic",
  "Onion", "Carrot", "Broccoli", "Potato chips", "Hedgehog", "Flamingo", "Platypus", "Sloth", "Koala",
  "Giant panda", "Jellyfish", "Starfish", "Seahorse", "Goldfish", "Hamster", "Guinea pig", "Owl", "Snail",
  "Firefly", "Bumblebee", "Squirrel", "Raccoon", "Skunk", "Beaver", "Otter", "Walrus", "Llama", "Alpaca",
  "Giraffe", "Hippopotamus", "Chameleon", "Tortoise", "Axolotl", "Snowman", "Lighthouse", "Roller coaster",
  "Ferris wheel", "Carousel", "Circus", "Bakery", "Barber", "Tattoo", "Selfie", "Emoji", "Karaoke",
  "Hide-and-seek", "Hopscotch", "Picnic", "Camping", "Bowling", "Darts", "Table tennis", "Badminton",
  "Soap bubble", "Hiccup", "Yawn", "Sneeze", "Tickling", "Nap", "Snoring", "Sleepwalking", "Goose bumps",
  "Dimple", "Freckle", "Chewing gum", "Toaster", "Corkscrew", "Vacuum flask", "Wind chime", "Scarecrow",
  "Piñata", "Balloon", "Confetti", "Fireworks", "Birthday cake", "Tooth fairy", "Hot air balloon",
  "Paper towel", "Tissue paper",
];

// For the dice buttons, and for filling in whichever page the player left blank.
export function randomHardPage(role: "start" | "end", exclude: string[] = []): string {
  const pool = (role === "start" ? HARD_STARTS : HARD_TARGETS).filter((t) => !exclude.includes(t));
  return pool[Math.floor(Math.random() * pool.length)];
}
