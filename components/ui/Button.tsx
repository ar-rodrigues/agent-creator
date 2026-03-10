import type { ReactNode, ButtonHTMLAttributes } from "react";
import Link from "next/link";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost";

type BaseProps = {
  variant?: Variant;
  children: ReactNode;
  className?: string;
};

type ButtonAsButton = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps> & {
    href?: never;
  };

type ButtonAsLink = BaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps> & {
    href: string;
  };

type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button({
  variant = "primary",
  children,
  className = "",
  ...rest
}: ButtonProps) {
  const classNames = `${styles.button} ${styles[variant]} ${className}`.trim();

  if ("href" in rest && rest.href) {
    const { href, ...linkRest } = rest;
    return (
      <Link href={href} className={classNames} {...linkRest}>
        {children}
      </Link>
    );
  }

  const { href: _h, ...buttonRest } = rest as ButtonAsButton;
  return (
    <button type="button" className={classNames} {...buttonRest}>
      {children}
    </button>
  );
}
