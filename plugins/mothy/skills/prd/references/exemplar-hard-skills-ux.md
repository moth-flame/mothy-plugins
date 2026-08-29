Hard Skills UX 2.0
Product Requirements Document (PRD)​

Related Documents:    Hard Skills UX 2.0      Hard Skills UX 2.0: First Principles
Status: In Development


Change history

 Changed by          Description of changes                                          Date

 Ethan Shaftel       Original                                                        7/1/25




Objectives
Build a streamlined set of features and affordances for use in Hard Skills modules that are
flexible enough to reuse across a variety of training and adapt to future needs, intuitive
enough to need minimal onboarding, and polished enough to communicate both to a user and
viewer of marketing videos that our work meets or exceeds the highest quality available from
competitors.


Problem Statement and Value Hypothesis
   ●​ Learners experience confusion and difficulty with module navigation and control without
      upfront onboarding or practice.
   ●​ This is because there is too much customizability and few constraints – navigation is
      “open-world,” UI elements (the tablet) must be manually called up and can be placed
      anywhere in space, and diegetic controls must be manipulated with more precision than
      can be expected from VR hand-tracking.
   ●​ This confusion and difficulty can be eliminated by removing navigation in favor of a
      guided path, giving control of UI placement and timing to the module Author instead of
      the Learner, and by simplifying and protecting diegetic hand interactions to eliminate
      unintended triggers.
   ●​ However, Learners would have to be okay with less freedom inside modules, something
      experienced users may value, and Authors would have to be okay making UI placement
      and navigation choices throughout every module, something that was previously
      delegated to the Learner.
  ●​ Unlike the “open-world” structure of recent modules, Hard Skills 2.0 modules will favor
     the new Learner’s experience to eliminate onboarding and appeal immediately, allowing
     M+F to grow its user base and reach more Learners.


Persona(s)
  ●​ Learner -- wants training experiences with little friction, and where any challenge comes
     from the content alone.
  ●​ Instructor -- wants the Learner’s time to be spent on content, not onboarding the
     software, troubleshooting different Learner’s problems.
  ●​ Author – wants to create new modules reusing a simple set of features, and wants to
     unify the training experience across disparate Learners.


Success Metrics
Metric        Value of metric         Target and          How            Last          Next steps
                                      Timeframe           measured       measured
                                                                         outcome &
                                                                         date

% of          Indicates that the      At least 90%        Direct
Learners      UX is sufficiently      of Learners         confirmation
that ask no   guided and              at first roll out   or reporting
questions     frictionless to         where we            by customer.
after         require no instructor   monitor.
launching     intervention on first
module        launch.



Milestones
  1.​ Sandbox Phase I: Diegetic Interactions
         a.​ Target release timeframe: Jul 9, 2025
         b.​ Related Job Stories (with MoSCoW priority):
                ■​ (Must) As a Learner, I want to trigger the switch/control I intend to with a
                     simple touch, and not trigger any nearby switches.
         c.​ Other scope (with MoSCoW priority):
                ■​ (Must) Sandbox includes features from previous hard skills modules that
                     we wish to retain: Hardskills 2.0 - Feature Prioritization
                ■​ (Should) Sandbox includes any novel interactions from modules currently
                     in production.
  2.​ Sandbox Phase II: UI Interactions - Roughs
         a.​ Target release timeframe: Jul 23, 2025
         b.​ Related Job Stories (with MoSCoW priority):
                ■​ (Must) As a Learner, I want display panels and buttons to be appropriately
                    sized and positioned for easy interaction.
        c.​ Other scope (with MoSCoW priority):
                ■​ (Must) UI Sandbox includes Laser point interaction, Floating Panels and
                    Object Panels, and all Guidance Cues (Control highlights, Voice Prompts)
                ■​ (Should) UI Sandbox includes Hand Panel and UI Platter.
 3.​ Sandbox Phase II: UI Interactions - Polished
        a.​ Target release timeframe: Aug 6, 2025
        b.​ Related Job Stories (with MoSCoW priority):
                ■​ (Must) As a Learner, I want display panels and buttons to be attractive
                    and elegantly laid out.
 4.​ Execution in Retrofit AMC Module
        a.​ Target release timeframe: Aug 27, 2025
        b.​ Related Job Stories (with MoSCoW priority):
                ■​ (Must) As a Learner, I want to avoid confusion with guided navigation and
                    well placed, attractive UI.
 5.​ Execution as Reusable Components
        a.​ Target release timeframe: Sep 24, 2025
        b.​ Related Job Stories (with MoSCoW priority):
                ■​ (Must) As a Learner, I want consistency of UI across M+F modules.
                ■​ (Must) As an Author, I want to reuse existing components easily rather
                    than customize each module.


Deadline and Appetite
 ●​ We want to test a minimum viable prototype by Jul 23, 2025
 ●​ We want to iterate toward launching a minimum livable & lovable product by
    Aug 27, 2025
 ●​ We have an appetite to invest 12 Engineer weeks to solve this problem.


Features Out
 ●​ We are not changing the training paradigm, just the UX of navigating space, diegetic
    controls, and non-diegetic UI.


Assumptions
 ●​ We are assuming that hand tracking and voice interaction will be default across the
    hardware for our training, and that controllers are also supported, and that timed-gaze is
    the baseline for the most limited hardware.
Design
Migration Strategy
   ●​ We will begin to retrofit old AMC modules with some elements of the Hard Skills 2.0
      Features
   ●​ We will develop reusable components in a Sandbox for testing iteration
   ●​ We will build new modules using those reusable components.

Impact
   ●​ Describe the potential impacts of the design on overall performance, security, and other
      aspects of the system.


Security, Privacy, and Other Risks
   ●​ If there are any risks or unknowns, list them here. Also if there is additional research to
      be done, mention that as well.


Open Questions/Issues
   ●​ What do you still need to figure out or address before development can begin?


 Question                               Answer                                   Answered by

                                                                                 (name)




FAQ
   ●​ Question
        ○​ Answer


Review Checklist
Title                          Name                                Reviewed      Date Reviewed

                                                                          ​

                                                                          ​
​
