import LegalPage, { Section } from "@/components/LegalPage";

export const metadata = {
  title: "Terms",
  description: "The rules for using Kuizen, in plain language.",
};

export default function Terms() {
  return (
    <LegalPage title="Terms" updated="21 September 2026">
      <p className="text-[17px] leading-relaxed text-ink">
        These are the rules for using Kuizen. They are written to be read, not to be skipped. By
        creating an account or joining a class, you agree to them.
      </p>

      <Section heading="What Kuizen is">
        <p>
          Kuizen is a platform for running classes: learning boards, activities, teams, quizzes and
          rankings. It is operated by Veltrix Technology Center together with Universiti Pendidikan
          Sultan Idris.
        </p>
      </Section>

      <Section heading="Your account">
        <p>
          Use real details so your educator knows who you are. One account belongs to one person.
          Keep your password to yourself; anything done from your account is treated as done by you.
          Tell us through the Help page if you think someone else has got into it.
        </p>
        <p>
          Educator accounts are approved by an administrator before they can create classes. That
          check exists so that people who run classes are who they say they are.
        </p>
      </Section>

      <Section heading="How to behave here">
        <p>
          Classmates and educators can see what you post. So: no harassment, no abuse, no content
          that is illegal or that you have no right to share. Do not post other people&rsquo;s
          private information. Do not upload material that belongs to someone else without their
          permission.
        </p>
        <p>
          Do not try to break the platform, reach data that is not yours, or get around the rules of
          a quiz or an activity. Doing the work is the point.
        </p>
      </Section>

      <Section heading="What you post stays yours">
        <p>
          Your submissions, board posts and intro card remain yours. By posting them you allow
          Kuizen to store and display them to the educators and classmates in the classes you belong
          to, which is what makes the class work. We do not use your work for anything else.
        </p>
      </Section>

      <Section heading="If you run a class">
        <p>
          Educators decide what their learners are asked to do and post, and are responsible for
          having the permission their institution requires. Content you remove from a class is
          removed for its members too, so remove carefully.
        </p>
      </Section>

      <Section heading="Availability">
        <p>
          We work to keep Kuizen running, but we cannot promise it is available at every moment.
          Features may change or be withdrawn as the platform develops. Where a change would affect
          work already in a class, we try to give notice first.
        </p>
      </Section>

      <Section heading="Suspending an account">
        <p>
          An account that breaks these rules may be suspended or removed. Where it is reasonable to
          do so, we say why first and give a chance to put it right.
        </p>
      </Section>

      <Section heading="Limits">
        <p>
          Kuizen is provided as it is. We are not responsible for work you lose because you did not
          keep your own copy, for what other users post, or for anything outside our reasonable
          control. Nothing here removes rights you have under Malaysian consumer law.
        </p>
      </Section>

      <Section heading="Which law applies">
        <p>
          These terms are governed by the laws of Malaysia, and the courts of Malaysia deal with any
          dispute arising from them.
        </p>
      </Section>

      <Section heading="Changes, and how to reach us">
        <p>
          If these terms change in a way that matters, the date at the top changes with it and we
          tell class members. Questions go through the feedback form on the Help page.
        </p>
      </Section>
    </LegalPage>
  );
}
