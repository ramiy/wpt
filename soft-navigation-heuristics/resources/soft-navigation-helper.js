const url = "/foobar.html";
const test_soft_navigation = (add_content, button, push_state, test_name) => {
  promise_test(async t => {
    const clicked = new Promise(resolve => {
      button.addEventListener("click", async e => {
        // Jump through a task, to ensure task tracking is working properly.
        await new Promise(r => t.step_timeout(r, 0));

        // Fetch some content
        const response = await fetch("../resources/content.json");
        const json = await response.json();

        if (push_state) {
          // Change the URL
          history.pushState({}, '', url);
        }

        add_content(json);

        resolve();
      });
    });
    if (test_driver) {
      test_driver.click(button);
    }
    await clicked;
    assert_equals(document.softNavigations, 1);
    await validate_soft_navigation_entry();
   }, test_name);
}

const validate_soft_navigation_entry = async () => {
  const entries = await new Promise(resolve => {
    (new PerformanceObserver(list => resolve(list.getEntries()))).observe(
      {type: 'soft-navigation', buffered: true});
    });
    assert_equals(entries.length, 1, "Performance observer got an entry");
    assert_true(entries[0].name.includes(url),
                "The soft navigation name is properly set");
    assert_not_equals(entries[0].navigationId,
                      performance.getEntriesByType("navigation")[0].navigationId,
                      "The navigation ID was incremented");
    assert_equals(performance.getEntriesByType("soft-navigation").length, 1,
                  "Performance timeline got an entry");
};
