export type DemoWorkout = {
  label: string;
  text: string;
};

export const DEMO_WORKOUTS: DemoWorkout[] = [
  {
    label: "800 m intervals",
    text: `Track intervals
Warm-up 1.6 km
Rest 90 sec walk
8 x 800 m @ 4:00, window 3:50-4:10, 90 sec walk recovery
Cool down 1 km`,
  },
  {
    label: "Tempo 3 km",
    text: `Tempo run
Warm-up 2 km, no faster than 5:10/km
3 km at 4:10/km, range 4:00-4:20/km
Rest 150 sec walk
Cool down 1.5 km`,
  },
  {
    label: "400 m repeats",
    text: `400m repeats
Warm-up 2 km, no faster than 5:10/km
Rest 90 sec walk
5 x 400 m at 3:40/km, range 3:30-3:50/km, 60 sec walk recovery
Rest 60 sec walk
5 x 400 m at 3:40/km, range 3:30-3:50/km, 60 sec walk recovery
Cool down 1 km`,
  },
  {
    label: "Block long run",
    text: `Block long run
8.5 km at conversational pace
6.5 km at 4:55/km
8 km at conversational pace`,
  },
];
