import LegalPage, { Section } from "@/components/LegalPage";

export const metadata = {
  title: "Privacy — Kuizen",
  description: "What Kuizen collects, who can see it, and what you can do about it.",
};

export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="21 September 2026">
      <p className="text-[17px] leading-relaxed text-ink">
        Kuizen is a classroom platform. It holds the small amount of information needed to run a
        class, and nothing more. This page says plainly what that is.
      </p>

      <Section heading="What we collect">
        <p>
          <strong className="text-ink">Your account.</strong> Your email address, a display name and
          a password. Passwords are stored as a one-way hash, so nobody at Kuizen can read them. You
          may add a username, a short About me and a photo to your intro card; those are optional and
          you choose what goes in them.
        </p>
        <p>
          <strong className="text-ink">If you sign in with Google.</strong> Google tells us your
          name, your email address and your profile picture. It does not give us your password, and
          we do not ask Google for anything else.
        </p>
        <p>
          <strong className="text-ink">What you do in a class.</strong> The classes and teams you
          belong to, your activity submissions and anything you post to a board, your quiz answers,
          and the points and ranks that follow from them.
        </p>
        <p>
          <strong className="text-ink">Basic usage records.</strong> Events such as signing in,
          opening an activity or submitting one, so educators can see whether a class is active and
          so we can find faults.
        </p>
      </Section>

      <Section heading="Who can see it">
        <p>
          <strong className="text-ink">Your educators.</strong> The educators of a class you join
          can see your name, your intro card, your team, your submissions and your scores in that
          class. That is the point of the class.
        </p>
        <p>
          <strong className="text-ink">Your classmates.</strong> They can see your intro card, your
          team, your position on the class leaderboard, and anything you post to a shared board.
          They cannot see your email address or your password.
        </p>
        <p>
          <strong className="text-ink">Administrators.</strong> A small number of administrators can
          see account records in order to run the platform, approve educator accounts and fix
          problems.
        </p>
        <p>
          We do not sell your information, we do not show advertising, and we do not hand your
          information to anyone else except the service providers named below, who process it only
          to make Kuizen work.
        </p>
      </Section>

      <Section heading="Where it is kept">
        <p>
          Kuizen runs on a private server, with its own database. It is not a shared commercial
          cloud account. Two outside services are involved: an email provider, which sends
          verification and invitation emails, and Google, but only if you choose to sign in with
          Google.
        </p>
      </Section>

      <Section heading="What stays in your browser">
        <p>
          Your sign-in session is kept in your own browser, not in a tracking cookie. If you untick
          Remember me, it is cleared when you close the browser. Kuizen does not use advertising or
          cross-site tracking cookies.
        </p>
      </Section>

      <Section heading="How long it is kept">
        <p>
          Your account and the work attached to it are kept while the account exists. Deleting your
          account from your profile deactivates it and signs you out. Work you submitted to a class
          stays with that class, because it is part of the class record your educator relies on.
        </p>
        <p>
          If you want your account and its personal details removed entirely rather than
          deactivated, ask through the Help page and we will do it.
        </p>
      </Section>

      <Section heading="What you can do">
        <p>
          You can change your display name, username, About me and photo at any time from your
          profile, and you can leave a class from your home page. You can change your email address
          or password from your profile. You can ask us what we hold about you, and ask us to
          correct or remove it.
        </p>
      </Section>

      <Section heading="Students and young learners">
        <p>
          Kuizen is used inside classes run by an educator or an institution. Where a class includes
          learners who are not adults, the educator and their institution are responsible for having
          the permission needed to enrol them, and for deciding what those learners are asked to
          post.
        </p>
      </Section>

      <Section heading="Changes, and how to reach us">
        <p>
          If this page changes in a way that matters, the date at the top changes with it. To ask a
          question about anything here, or to make a request about your own information, use the
          feedback form on the Help page. It reaches the people who run the platform.
        </p>
      </Section>
    </LegalPage>
  );
}
