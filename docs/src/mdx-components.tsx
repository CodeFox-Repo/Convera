import {
  CircleStackIcon,
  CodeBracketIcon,
  CommandLineIcon,
  ComputerDesktopIcon,
  DocumentArrowDownIcon,
  // PackageIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Accordion } from "fumadocs-ui/components/accordion";
import { Callout } from "fumadocs-ui/components/callout";
import { Card, Cards } from "fumadocs-ui/components/card";
import { Step,Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Accordion,
    Callout,
    Card,
    Cards,
    Steps,
    Tab,
    Tabs,
    Step,
    ComputerDesktopIcon,
    CodeBracketIcon,
    // PackageIcon,
    CommandLineIcon,
    WrenchScrewdriverIcon,
    CircleStackIcon,
    DocumentArrowDownIcon,
    ...components,
  };
}
