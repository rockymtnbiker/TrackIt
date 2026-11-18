# Maya "Get a job" flow + check-in fixes — build spec

Ground rules
- Expo SDK 58 / React Native / TypeScript / Supabase. Do NOT write or suggest SQL. All needed columns already exist (goals: parent_id, title, why, category, status, unit, target_amount, repeat_period, planned_days, target_end_date, actual_start_date; user_settings: maya_level, reflection_day, reflection_time; profiles: age_range).
- Do not run git commands. Do not change Plan/Do/Reflect layouts, chat screens, invite codes, badges, or the onboarding cards except where listed.
- Copy every user-facing string exactly. Text in [brackets] is a note for the developer, never shown to the user.
- Part 1 (keyboard fix) is already done. Do Part 2, run `npx tsc --noEmit`, fix errors, then Part 3, run it again.
- If something is blocked or unclear, STOP and say what's blocking instead of guessing.
- At the end, write a summary: files changed per part, anything you couldn't do, anything that needs a decision.

---

## PART 2 — New "Get a job" Maya flow

Replace ONLY the job branch of the Maya goal-setup chat. Other areas keep working exactly as they do today.
Put ALL Maya text for this flow in one file, `src/constants/maya/jobFlow.ts` (typed data: questions, options, coaching lines, steps), so wording can be edited later without touching logic.

### 2A. Shared opening (applies to all areas)

1. Intro (replace current intro text):
   "Hey [name], I'm Maya, your Automated Advisor. I'm here to help you become your best you. Let's get you started. I'll ask you a few questions and then suggest some options based on your answers. Go with my suggestions or customize them to fit better."
   Options: Let's go · I already know what I want [= set it up on my own]

2. Age range [asked once per user, saved to profiles.age_range; keep current behavior]:
   Under 18 · 18–24 · 25–34 · 35–49 · 50+ · Prefer not to say
   [Under 18 continues; no blocking.]

3. Temperature check: "Before we dive in, how's life feeling lately?"
   Options: Pretty good, I want to level up · Busy but handling it · Stretched thin · Kind of stuck

4. Area: "Which of these is taking up the most space in your head right now?"
   Options: Get a job · Classes and grades · Health and fitness · Dating and relationships · Friends and social life · Faith or purpose · Something else
   [Rename "Landing a job" to "Get a job". Remove "Money". Other areas route to their existing flows.]

### 2B. Job flow, in this order

5. Why: "Finish this sentence: I want to get a job so that I can…"
   Example chips: pay for tuition and other expenses · do work I actually care about · ✏️ In my own words
   [Tapping an example puts it in the text box to edit; it does not submit. Save goals.why as the full sentence "I want to get a job so that I can ___."]

6. "On a scale of 1–10, how important is this to you right now?"
   [7+ continue. 6 or lower → "Fair. What would make it an 8? Or is something else actually more important right now?" with options "Keep going" (continue) and "Something else is more important" (back to step 4).]

7. "Where are you in the search?"
   Options: Haven't started applying · Applying, but not getting interviews · Interviewing, but no call backs

8. Target date. Maya's opening depends on step 7:
   - Haven't started: "No problem, everyone starts somewhere. Before we get into the details, let's set a target. When do you want to have a job by?"
   - Applying: "Oh, that's so frustrating! The good news is that it happens to a lot of people, and there's plenty we can do to improve your chances. Before we get into what's going on, let's set a target. When do you want to have a job by?"
   - Interviewing: "That's so awesome! You're SO close! Before we dig in, let's set a target. When do you want to have a job by?"
   Options: End of this semester · This summer · In 3 months · In 6 months · Pick a date
   [End of this semester = the next of May 15 / Dec 15. This summer = the next June 1. Pick a date = shared DatePickerModal. Save as goals.target_end_date using the shared local-date helper.]

9. "How much time are you realistically going to give this effort each week?"
   Options: 1–2 hours · 3–5 hours · 6–10 hours · Skip
   [Preselect from step 3: Stretched thin or Kind of stuck → 1–2; Busy → 3–5; Level up → 6–10. Save the low end of the range (1, 3 or 6). Skip = no "Job search time" step.]

   Date check, right after this answer. Starting branch comes from step 7: Haven't started → Decide (but answer (b) below starts at Update resume); Applying or Interviewing → Apply and interview.
   Tight if the date is less than 2 months away (Decide), less than 6 weeks (Update resume), less than 3 weeks (Apply and interview). If tight, say once:
   "That's a fast timeline from where you are. Want to push the date back, or put in more hours a week?"
   Options: Push the date back [re-ask step 8] · More hours a week [re-ask step 9] · Keep my answers [continue]
   [For Haven't started, run this check after the step 10 answer, since that decides Decide vs Update resume.]

10. Follow-up question. Maya's text depends on step 7. Each answer shows its coaching line, then its suggested steps (keep / reword / remove / add, same UI as today).

#### HAVEN'T STARTED
Maya: "Okay, you've got a target and the time to get there. Now let's figure out where to start. What's holding you back?"

**(a) I'm not sure what kind of job I want** [branch: Decide]
Coaching: "Have you thought about talking to someone who works in a field that interests you? It's one of the best ways to compare careers, build your network, and sharpen your goals. Most people are happy to give you 20 minutes. You can also find job descriptions online to help narrow the search to something that you're qualified for and that interests you. Here are a few suggested steps to get you moving in the right direction. Select the ones that resonate with you. Re-phrase them, change them, and add as many more as you want."
Steps:
- Do a quick online search for a few jobs that sound interesting and read their job descriptions
- List 3–5 jobs that sound interesting
- Ask 2 people who have those jobs for a 20-minute chat
- Book one career center appointment

**(b) I don't know what to put on my resume** [branch: Update resume]
Coaching: "A great resume shows what you can do, not just where you've been. Recruiters skim fast, so lead with results. 'Did inventory' tells them what your job was. 'Cut counting time by 20%' tells them what you can do. If you don't have much work experience yet, pull from class projects, volunteering, clubs, sports, and things you handle at home. They all count. Most companies also run resumes through software that scans for keywords from the job description, so use their words wherever they're true for you. Here are a few suggested steps to make your resume stand out. Select the ones that resonate with you. Re-phrase them, change them, and add as many more as you want."
Steps:
- Identify 5 skills I've acquired + 1 example each
- Turn 3 resume bullets into results with a number
- Add a class project, volunteer role, or club role
- Use my favorite AI tool to compare my resume with a job description and spot accomplishments I'm overlooking
- Add the posting's keywords wherever they're true for me
Then Maya (AI_WARNING, reused below): "One heads-up: don't let the AI write it for you. It tends to stretch the truth, and hiring managers see so many AI resumes that generic ones get tossed. Use it to find your strengths, then write it your way."

**(c) Finding time with classes and work** [branch: Decide]
Coaching: "Try treating it like a class. A couple of short blocks on your calendar each week beats a stressful all-nighter. Let's make the time you set aside count."
Then: "Are you willing to block out your [hours] on your calendar each week?"
Options: Yes, I'll block it out · Not sure yet
- Yes → add one-time step "Put my job search time on my calendar", then: "Love it. Now that you're going to make time for it, how do you want to start using that time?"
  Options: Figure out what kind of job I want [continue as (a)] · Write my resume [continue as (b)] · I can take it from here
  [I can take it from here = same as cancel → "Save and finish on my own": save goal + steps so far; set maya_level = 'occasional' ONLY if the user never chose a level; open the Goal page.]
- Not sure yet → "That's okay. Want to start with a smaller amount?" → back to step 9.

#### APPLYING, BUT NOT GETTING INTERVIEWS
Maya: "Okay, you've got a target and the time to get there. Now let's figure out why your applications aren't landing. Does one of these sound like you?" [branch: Apply and interview for all]

**(d) I'm applying to a lot of different job titles**
Coaching: "Casting a wide net feels productive, but it usually backfires. When you apply everywhere, each application ends up generic and the fit isn't there. Going narrower usually gets you further. Here are a few suggested steps to find your focus. Select the ones that resonate with you. Re-phrase them, change them, and add as many more as you want."
Steps:
- List what I'm good at and what I enjoy, then match it to job titles
- Ask someone who has that job what it's really like
- Pick no more than 2 job titles and only apply to those
- Apply to 5 jobs a week

**(e) I send the same resume to every job**
Coaching: "Most companies run every resume through software that scans for keywords from the job description before a person sees it, and then a recruiter skims it in seconds. One resume can't match every posting. Lead with results, not duties: 'Did inventory' tells them what your job was. 'Cut counting time by 20%' tells them what you can do. Here are a few suggested steps to tailor yours without starting from scratch. Select the ones that resonate with you. Re-phrase them, change them, and add as many more as you want."
Steps:
- Apply to 5 jobs a week
- Use my favorite AI tool to compare my resume with a job description and spot accomplishments I'm overlooking
- Rewrite 3 bullets to show a result with a number
- Add the posting's keywords wherever they're true for me
- Tailor my cover letter to each posting with my best skills + examples
- Have the school's career center review my resume
Then AI_WARNING.

**(f) I'm missing some of the requirements**
Coaching: "Applying a bit outside the list is fine. Many requirements are a wish list. But if you're missing the core ones, it's an easy no. You probably have more proof of what you can do than you think, from classes, jobs, and clubs. Here are a few suggested steps to find jobs where you're a strong match. Select the ones that resonate with you. Re-phrase them, change them, and add as many more as you want."
Steps:
- Identify 5 skills I've acquired + 1 example each
- Before I apply, check that I meet most of the core requirements
- Apply to 5 jobs a week

**(g) None of these really fit**
Coaching: "That's okay. It isn't always obvious what's holding an application back. The fastest way to figure that out is to look at your applications the way an employer would and find the gaps. Here are a few suggested steps to do that. Select the ones that resonate with you. Re-phrase them, change them, and add as many more as you want."
Steps:
- Use my favorite AI tool to compare 3 postings I applied to with my resume, and find which skills or keywords they wanted that my resume doesn't show
- Get one application reviewed by the school career center
- Fix the biggest gap I find before my next application
- Apply to 5 jobs a week
Then AI_WARNING.

#### INTERVIEWING, BUT NO CALL BACKS
Maya: "Okay, you've got a target and the time to get there. Now let's look at what's happening in your interviews. Which of these sounds most like you?" [branch: Apply and interview for all]

**(h) I get nervous and my mind goes blank**
Coaching: "Nerves are totally normal. The fix is practice. Once you've told your best stories a few times, you're not making it up on the spot anymore. Here are a few suggested steps to start practicing. Select the ones that resonate with you. Re-phrase them, change them, and add as many more as you want."
Steps:
- Apply to 5 jobs a week
- Write 5 stories using STAR: situation, task, action, result
- Do one mock interview at the school career center
- Practice my answers out loud with a friend

**(i) When they ask about my experience, I mostly repeat my resume**
Coaching: "Your resume got you the interview. Now they want the story behind it. A short story about what you actually did makes it real. Here are a few suggested steps to get your stories ready. Select the ones that resonate with you. Re-phrase them, change them, and add as many more as you want."
Steps:
- Apply to 5 jobs a week
- Pick 5 things from my resume and write the story behind each (situation, task, action, result)
- Match each story to a common interview question
- Practice telling each one out loud in under 2 minutes

**(j) I go in without researching the company much**
Coaching: "Interviewers can tell who did their homework. A little prep shows you actually want this job. Here are a few suggested steps for your next interview. Select the ones that resonate with you. Re-phrase them, change them, and add as many more as you want."
Steps:
- Apply to 5 jobs a week
- Research each company before the interview
- Prepare 2 questions to ask them
- Reread the job posting the night before

**(k) I don't follow up after the interview**
Coaching: "A short follow-up keeps you top of mind and shows you're serious. Serious job seekers never skip it. Mention one thing you talked about in the interview so they remember you. Here are a few suggested steps to make it easy. Select the ones that resonate with you. Re-phrase them, change them, and add as many more as you want."
Steps:
- Apply to 5 jobs a week
- Send a follow-up note within 24 hours
- Check in once if I haven't heard back in a week

**(l) None of these really fit**
Coaching: "Getting interviews means your application works. Now it's about the in-person interaction, and that gets better with practice and feedback. One easy way to get feedback: near the end of your next interview, ask, 'Is there anything about my background you'd want to know more about before making a decision?' It gives you a chance to clear up a concern while you're still in the room. Here are a few suggested steps to start with. Select the ones that resonate with you. Re-phrase them, change them, and add as many more as you want."
Steps:
- Apply to 5 jobs a week
- Ask my feedback question toward the end of my next interview
- Do one mock interview at the school career center
- Write 5 stories using STAR

### 11. Goal card
Replaces the old playback, plan card and goal-name step. There is NO goal-name question anymore.

"Great. Here's what we've captured for your goal so far. You want to get a job by [date] so that you can [why]. Since [SINCE], you'll start [START], with the steps you picked. It's your goal, so change anything you'd like."

| Answer | SINCE | START |
|---|---|---|
| a | you're still deciding what kind of job you want | there |
| b | you're not sure what to put on your resume | with your resume |
| c | use the branch he picked (a or b) | |
| d | you're applying to a lot of different job titles | by narrowing your focus |
| e | you're sending the same resume to every job | by tailoring your applications |
| f | you're missing some of the requirements on the jobs you apply for | by finding jobs where you're a strong match |
| g | you're applying but not sure why you're not getting interviews | by finding what's holding your applications back |
| h | you get nervous in interviews | with practice |
| i | you mostly repeat your resume in interviews | by getting your stories ready |
| j | you go in without researching the company much | with interview prep |
| k | you don't follow up after interviews | by making follow-ups easy |
| l | you're getting interviews but no call backs | with practice and feedback |

Card shows: "Get a job · by [date]", "Job search time · [hours] a week" (unless skipped), then the remaining branches in order, with "start here" on the current one and his steps under it.
Buttons: Looks right · Edit [Edit = the existing inline editing of title/date/steps].

### 12. Accountability partner (replace current "who can help" text)
"Goals are easier to stick with when someone's in your corner. An accountability partner is a friend you check in with frequently. They can see this goal and cheer you on. Who could that be for you?"
Options: A friend or roommate · A classmate · A family member · Someone else who's job hunting · Not sure yet
Then: Invite them now [existing invite-code flow] · I'll do it later
If "Not sure yet": "No problem. You can invite someone anytime from Connect."

### 13. Check-ins [existing maya_level question, asked once per user]
"Last thing: how much should I check in with you?"
Options: Lots of encouragement · Occasional · Self-motivated

### 14. Closing
"Nice work, [name]. Your goal is set. I'll check in with you on [reflection day name from user_settings.reflection_day] to see how your first week went, and I'm always here in Connect if you need me before then."
[If maya_level is 'self', the sentence after "Your goal is set." becomes: "I won't bug you, but I'm always here in Connect if you need me."]

"If you'd like more help along the way, an Achievement Coach is a real person who works with you one-on-one. They can help you break down your next steps, work through anything that gets in the way, and keep your momentum going. Want to talk with one?"
Options: Talk with an Achievement Coach · Let's write another goal · I'm good for now
- Coach → open the existing Talk to someone request sheet over the chat. On send: close it; Maya says "Got it. A coach will reach out soon." On close without sending: back to the same three choices.
- Another goal → stay in the chat, go back to step 4 (don't re-ask age or temperature).
- I'm good for now → "Sounds good. You can reach an Achievement Coach anytime from Connect."
- A "Close chat" button in the chat ends it and opens the new goal's Goal page.

### 2C. What gets saved
- Top-level goal: title "Get a job", why (step 5), target_end_date (step 8), category = the existing job/career area key, status active, actual_start_date today, unit null.
- Children, in this order:
  1. "Job search time" — repeating weekly, unit 'hours', target_amount = low end from step 9 (1, 3 or 6), planned_days []. Skip if Skip.
  2. Branch steps (one-time parents), only from the starting branch onward: "Decide what kind of job I want", "Update resume", "Apply and interview". Starting branch status active, later ones pending.
  3. Under the starting branch: the steps he kept (one-time), plus "Put my job search time on my calendar" if added in (c).
  4. "Apply to 5 jobs a week" — whenever kept, save it as a REPEATING weekly step under "Apply and interview": unit 'applications' (custom unit), target_amount 5, planned_days []. Never as a one-time step.
- Keep the existing Maya cancel behavior (save and finish on my own / discard / keep going).

---

## PART 3 — Maya check-in fixes

a) Do card and toasts on EVERY goal: remove the Maya-goal requirement (listMayaGoalIds / maya-helper AsyncStorage check) from mayaDailyLine, planMayaReaction and the first-log partner sheet. The partner sheet still shows only once per user.

b) Do card picks the step that needs attention: walk root goals in plan order; within each, check repeating steps at ANY depth (not just direct children); pick the first one that's planned today (planned_days null or [] counts as any day) and not yet met. Keep the 'lots' / 'occasional' rules.

c) In src/lib/reminders.ts, don't schedule the weekly reflection reminder when maya_level is 'self'. Reflect itself is unchanged.

d) No morning push. Don't add one.
