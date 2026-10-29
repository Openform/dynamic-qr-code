import Link from "next/link"

/**
 * The sign-up button from getSignupCta(): a Next.js Link for pages on this
 * site, a plain link for an outside invite form or email address.
 */
export default function CtaLink({ cta, className, id, children }) {
  const label = children ?? cta.label

  if (cta.external) {
    return (
      <a href={cta.href} className={className} id={id}>
        {label}
      </a>
    )
  }

  return (
    <Link href={cta.href} className={className} id={id}>
      {label}
    </Link>
  )
}
