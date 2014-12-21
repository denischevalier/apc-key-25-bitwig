// Controller for APC Key 25
// Copyright (C) 2014 Osaka Red LLC

loadAPI(1);

host.defineController("Akai", "APC Key 25", "1.0", "65176610-873b-11e4-b4a9-0800200c9a66");
host.defineMidiPorts(1, 0);
host.addDeviceNameBasedDiscoveryPair(["APC Key 25"], ["APC Key 25"]);
host.addDeviceNameBasedDiscoveryPair(["APC Key 25 MIDI 1"], ["APC Key 25 MIDI 1"]);

// Midi notes that are used to change behavior, launch clips, etc.
var control_note =
{
   record :         93,
   play_pause :     91,
   shift :          98,
   clip_stop :      82,
   solo :           83,
   rec_arm :        84,
   mute :           85,
   select :         86,
   stop_all_clips : 81,
   up :             64,
   down :           65,
   left :           66,
   right :          67,
   volume :         68,
   pan :            69,
   send :           70,
   device :         71

   // Grid
   // 32 33 34 ...
   // 24
   // 16
   // 8
   // 0
}

// Midi control change messages from the 8 knobs
var lowest_cc = 48;
var highest_cc = 55;

// Just the dimensions of the grid
var grid_width = 8;
var grid_height = 5;

// Note velocities to use in responses to trigger the grid notes
var grid_button_mode =
{
   off :            0,
   green :          1,
   blinking_green : 2,
   red :            3,
   blinking_red :   4,
   amber :          5,
   blinking_amber : 6
}

var track_button_mode =
{
   off :            0,
   red :            1,
   blinking_red :   2
}

var scene_button_mode =
{
   off :            0,
   green :          1,
   blinking_green : 2
}

var playing = false;
// If shift is being held
var shift_on = false;
// Which function the knobs currently play
var knob_mode = control_note.device;
// What the present function of the track buttons is
var track_mode = control_note.clip_stop;
// The grid of clips with their states and listener functions, corresponding to the grid on the controller
var grid = [];

// Some global Bitwig objects
var main_track_bank;

// Initializes a clip
function initializeClip(clip, clip_index)
{
   // Clip attributes
   clip.has_content = false;
   clip.playing = false;
   clip.recording = false;
   clip.queued = false;

   // Callbacks to be called by Bitwig but also to be called when putting it back into clip mode
   // (If I ever implement other modes not seen in the Ableton script, wouldn't that be cool?)
}

// Initializes a track
function initializeTrack(track, track_index)
{
   track.clips = [];

   // Track attributes
   track.muted = false;
   track.soloed = false;
   track.armed = false;
   track.exists = false;
   track.index = track_index;

   // Callbacks for track changes
   track.solo_callback = function(value)
   {
      track.soloed = value;
      track.display();
   }

   track.mute_callback = function(value)
   {
      track.muted = value
      track.display();
   }

   track.exists_callback = function(value)
   {
      track.exists = value;
      track.display();
   }

   track.display = function()
   {
      // In shift mode, the track buttons go into a different function
      if (shift_on) return;
      // Duh, don't draw anything if the track doesn't even exist
      if (!track.exists)
      {
         track.clear();
         return;
      }
      switch (track_mode)
      {
         case control_note.solo:
            // In Ableton, this works differently (lights on for NOT muted) but that seems wrong to me
            sendMidi(144, control_note.up + track.index, track.soloed? track_button_mode.red : track_button_mode.off);
            break;
         case control_note.mute:
            sendMidi(144, control_note.up + track.index, track.muted? track_button_mode.red : track_button_mode.off);
            break;
      }
   }

   track.clear = function()
   {
      sendMidi(144, control_note.up + track.index, track_button_mode.off);
   }

   // Register these callbacks
   main_track_bank.getTrack(track_index).getSolo().addValueObserver(track.solo_callback);
   main_track_bank.getTrack(track_index).getMute().addValueObserver(track.mute_callback);
   main_track_bank.getTrack(track_index).exists().addValueObserver(track.exists_callback);
   
   for (scene_index = 0; scene_index < grid_height; ++scene_index)
   {
      clip = {}
      initializeClip(clip, scene_index);
      track.clips[scene_index] = clip;
   }
}

// Initializes the grid
function initializeGrid()
{
   // In case this somehow gets called multiple times
   grid = [];

   for (track_index = 0; track_index < grid_width; ++track_index)
   {
      track = grid[track_index] = {};
      initializeTrack(track, track_index);
   }
}

function displayGrid()
{
   for (track_index = 0; track_index < grid_width; ++track_index)
   {
      track = grid[track_index];
      track.display();
      // for (scene_index = 0; scene_index < grid_height; ++scene_index)
      // {
      //    clip = grid[track_index].clips[scene_index];
      //    clip.display();
      // }
   }
}

function clearGrid()
{
   for (track_index = 0; track_index < grid_width; ++track_index)
   {
      track = grid[track_index];
      track.clear();
      // for (scene_index = 0; scene_index < grid_height; ++scene_index)
      // {
      //    clip = grid[track_index].clips[scene_index];
      //    clip.clear();
      // }
   }
}

function init()
{
   host.getMidiInPort(0).setMidiCallback(onMidi);

   // Make sure to initialize the globals before initializing the grid and callbacks
   // What does argument 2 do?
   main_track_bank = host.createMainTrackBank(8, 3, 5);

   generic = host.getMidiInPort(0).createNoteInput("Akai Key 25", "?1????");
   generic.setShouldConsumeEvents(false);

   // Make CCs 1-119 freely mappable
   // userControls = host.createUserControlsSection(HIGHEST_CC - LOWEST_CC + 1);

   // for(var i=LOWEST_CC; i<=HIGHEST_CC; i++)
   // {
   //    userControls.getControl(i - LOWEST_CC).setLabel("CC" + i);
   // }

   transport = host.createTransportSection();
   transport.addIsPlayingObserver(function(on)
   {
      playing = on;
   });

   initializeGrid();
   displayGrid();
}

// Light up the mode lights as appropriate for shift mode
function shiftPressed()
{
   shift_on = true;
   clearGrid();
   sendMidi(144, knob_mode, track_button_mode.red);
   sendMidi(144, track_mode, scene_button_mode.green);
   // TODO light up the right arrows
}

// Leaving shift mode, turn off any lights it turned on
function shiftReleased()
{
   shift_on = false;
   sendMidi(144, knob_mode, track_button_mode.off);
   sendMidi(144, track_mode, scene_button_mode.off);
   // TODO turn off arrow light(s)
   displayGrid();
}

// Change the track button mode and, if in shift mode, switch which button is lighted
function changeTrackButtonMode(mode)
{
   // Do nothing if the note is out of range
   if (mode < control_note.clip_stop || mode > control_note.select) return;
   // Turn off light 
   sendMidi(144, track_mode, scene_button_mode.off);
   track_mode = mode;
   // Turn the right mode back on
   sendMidi(144, track_mode, scene_button_mode.green);
}

// Like the above function but for knob modes
function changeKnobControlMode(mode)
{
   if (mode < control_note.volume || mode > control_note.device) return;
   sendMidi(144, knob_mode, track_button_mode.off);
   knob_mode = mode;
   sendMidi(144, knob_mode, track_button_mode.red);
}

function onMidi(status, data1, data2)
{
   printMidi(status, data1, data2);

   // We only care about what happens on channel 0 here since that's where all the interesting stuff is
   if (MIDIChannel(status) != 0) return;

   if (isNoteOn(status))
   {
      if (shift_on)
      {
         if (data1 >= control_note.clip_stop && data1 <= control_note.select)
         {
            changeTrackButtonMode(data1);
         }
         else if (data1 >= control_note.volume && data1 <= control_note.device)
         {
            changeKnobControlMode(data1);
         }
      }
      else
      {
         switch (data1)
         {
            case control_note.play_pause:
               if (!playing)
               {
                  transport.play();
               }
               else
               {
                  // Grrr. Why can't I do pause instead of stop?
                  transport.stop();
               }
               break;
            case control_note.record:
               transport.record();
               break;
            case control_note.shift:
               shiftPressed();
               break;
         }
         // Some things don't lend themselves to switch statements
         if (data1 >= control_note.up && data1 <= control_note.device)
         {
            track_index = data1 - control_note.up;
            switch (track_mode)
            {
               case control_note.solo:
                  main_track_bank.getTrack(track_index).getSolo().toggle();
                  break;
               case control_note.mute:
                  main_track_bank.getTrack(track_index).getMute().toggle();
                  break;
            }
         }
      }
   }
   else if (isNoteOff(status))
   {
      switch (data1)
      {
         case control_note.shift:
            shiftReleased();
            break;
      }
   }
   else if (isChannelController(status))
   {
      // Make sure it's in the range. Don't see why it wouldn't be
      if (data1 < lowest_cc || data1 > highest_cc) return;
   }

   // if (isChannelController(status))
   // {
   //    if (data1 >= LOWEST_CC && data1 <= HIGHEST_CC)
   //    {
   //       var index = data1 - LOWEST_CC;
   //       userControls.getControl(index).set(data2, 128);
   //    }
   // }
}

function exit()
{
}
